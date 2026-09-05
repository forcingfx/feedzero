/**
 * Canonical price copy for the paid plan.
 *
 * Sibling to `tier-matrix.ts`: the matrix owns *what* each tier includes,
 * this module owns *what it costs*. Between them there is no other place a
 * price or a trial length may be written down.
 *
 * Why it exists: before this, the amount lived in eight hardcoded JSX
 * literals across three components, unshared and unpinned by any test. The
 * predictable happened — `subscription-tab.tsx` still rendered a `$19/month`
 * Pro price that no other surface agreed with. One constant, one test.
 *
 * Why a constant and not env or the Stripe Dashboard (ADR 015): monetary
 * terms belong in code review history. An env var pushes the same trust
 * problem one layer down, and Dashboard config drifts silently between
 * staging and live mode. Stripe supplies opaque price *IDs* through env;
 * the human-readable amount is ours.
 */

export const PAID_PLAN = {
  /** Headline amount, currency symbol included. */
  amount: "$9",
  /** Billing period. Annual only — there is no monthly price. */
  period: "year",
  /** Ready-to-render label. Price surfaces use this rather than composing their own. */
  display: "$9/year",
  /**
   * Free-trial length applied to every Checkout Session.
   *
   * To sunset the trial, remove the `subscription_data` field from the
   * Checkout create call — Stripe rejects `trial_period_days: 0`, so zero
   * is not a valid off-switch.
   */
  trialDays: 14,
} as const;
