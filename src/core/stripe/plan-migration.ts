/**
 * Pure logic for the ADR 029 migration: move every legacy monthly subscriber
 * onto the single $9/year price at their next renewal, charging nothing in
 * between.
 *
 * ADR 029 decision item 7 chose "migrate at next renewal, no proration" over
 * an immediate switch precisely because an immediate one issues real credits
 * and real charges against real customers to save a few months of waiting.
 * Stripe's mechanism for "change the price when the current period ends" is a
 * Subscription Schedule, applied per subscription in two requests:
 *
 *   1. `subscriptionSchedules.create({ from_subscription })` — Stripe returns
 *      a schedule whose single phase mirrors the subscription's current
 *      billing period and configuration.
 *   2. `subscriptionSchedules.update(id, buildAnnualScheduleUpdate(...))` —
 *      re-state that phase and append the annual one after it.
 *
 * This module owns the decisions in those two calls and nothing else; the
 * network shell lives in `scripts/migrate-to-annual-plan.ts`, mirroring the
 * `admin-find-license.ts` / `find-license.ts` split so the semantics are
 * testable without a Stripe account.
 *
 * The two rules worth knowing before reading further, both from Stripe's
 * subscription-schedules documentation:
 *
 *   - **An update unsets whatever it omits.** Stripe does not merge a phase
 *     update into the existing phase; it replaces it. A phase re-stated
 *     without its discounts loses them, permanently and silently. That is why
 *     `buildAnnualScheduleUpdate` echoes the current phase wholesale rather
 *     than naming the fields it cares about.
 *   - **A final phase with no duration runs indefinitely.** That is the shape
 *     for "this is the price from now on" — as opposed to `iterations`, which
 *     would end the annual phase after one year and hand the subscription
 *     back at whatever price the schedule defaulted to.
 */

/** Minimal subset of a Stripe Subscription this migration reads. */
export interface SubscriptionSummary {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  /** Schedule id when one is already attached, else null. */
  schedule: string | null;
  items: { data: { price: { id: string } }[] };
}

/** A phase as Stripe returns it, plus the pass-through fields we must echo. */
export interface SchedulePhase {
  start_date: number;
  end_date: number;
  items: { price: string; quantity?: number }[];
  [passThrough: string]: unknown;
}

/** Minimal subset of a Stripe Subscription Schedule this migration reads. */
export interface ScheduleSummary {
  phases: SchedulePhase[];
}

/**
 * Why a subscription was left alone. Every one of these is a case where
 * acting would be worse than not acting, so the CLI reports them rather than
 * treating them as failures.
 */
export type MigrationSkipReason =
  | "already-annual"
  | "already-scheduled"
  | "cancelling"
  | "inactive-status"
  | "multiple-items";

export type MigrationPlan =
  | { subscriptionId: string; action: "migrate" }
  | { subscriptionId: string; action: "skip"; reason: MigrationSkipReason };

/**
 * Statuses whose next renewal is still ahead of them.
 *
 * `past_due` is included deliberately: Stripe retries a failed card for
 * roughly three weeks, and ADR 029's whole reason for adding a grace window
 * was that those customers are still customers. Excluding them here would
 * strand exactly the people the grace window exists to protect on the old
 * price.
 */
const MIGRATABLE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Decide what to do with one subscription, without touching the network.
 *
 * Ordering matters: `already-annual` is checked first so a re-run of the
 * migration reports "nothing to do" rather than "already scheduled" for
 * subscriptions the previous run completed.
 */
export function planSubscriptionMigration(
  subscription: SubscriptionSummary,
  annualPriceId: string,
): MigrationPlan {
  const { id } = subscription;
  const skip = (reason: MigrationSkipReason): MigrationPlan => ({
    subscriptionId: id,
    action: "skip",
    reason,
  });

  const items = subscription.items.data;

  if (items.some((item) => item.price.id === annualPriceId)) {
    return skip("already-annual");
  }
  if (items.length !== 1) return skip("multiple-items");
  if (subscription.schedule !== null) return skip("already-scheduled");
  if (subscription.cancel_at_period_end) return skip("cancelling");
  if (!MIGRATABLE_STATUSES.has(subscription.status)) {
    return skip("inactive-status");
  }

  return { subscriptionId: id, action: "migrate" };
}

/**
 * The `phases` field of a schedule update, plus the end behaviour.
 *
 * A tuple, not an array: this update always produces exactly the current
 * phase followed by the annual one, and saying so lets callers read either
 * end without narrowing.
 */
export interface ScheduleUpdate {
  phases: [SchedulePhase, AnnualPhase];
  end_behavior: "release";
}

export interface AnnualPhase {
  items: { price: string; quantity: number }[];
  /**
   * No proration at the switchover. The customer paid for the period they are
   * in; the annual charge lands when it ends, and not a cent before.
   */
  proration_behavior: "none";
}

/**
 * Build the second request: re-state the current phase verbatim, then append
 * an open-ended annual phase after it.
 *
 * Throws rather than returning a `Result` because every input comes from the
 * response Stripe just gave us one line earlier. A schedule created with
 * `from_subscription` has exactly one phase; more than that means the caller
 * passed something else, which is a programming error the operator wants to
 * see as a stack trace, not a value to branch on.
 */
export function buildAnnualScheduleUpdate(
  schedule: ScheduleSummary,
  annualPriceId: string,
): ScheduleUpdate {
  if (schedule.phases.length !== 1) {
    throw new Error(
      `expected a schedule with a single current phase, got ${schedule.phases.length}`,
    );
  }

  const current = schedule.phases[0];
  const quantity = current.items[0]?.quantity ?? 1;

  return {
    phases: [
      { ...current },
      {
        items: [{ price: annualPriceId, quantity }],
        proration_behavior: "none",
      },
    ],
    end_behavior: "release",
  };
}
