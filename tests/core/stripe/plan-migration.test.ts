import { describe, expect, it } from "vitest";

import {
  buildAnnualScheduleUpdate,
  planSubscriptionMigration,
  type ScheduleSummary,
  type SubscriptionSummary,
} from "@/core/stripe/plan-migration";

const ANNUAL_PRICE = "price_annual_9";
const MONTHLY_PRICE = "price_monthly_5";

function subscription(
  overrides: Partial<SubscriptionSummary> = {},
): SubscriptionSummary {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    schedule: null,
    items: { data: [{ price: { id: MONTHLY_PRICE } }] },
    ...overrides,
  };
}

describe("planSubscriptionMigration", () => {
  it("migrates an active monthly subscriber", () => {
    const plan = planSubscriptionMigration(subscription(), ANNUAL_PRICE);

    expect(plan).toEqual({ subscriptionId: "sub_1", action: "migrate" });
  });

  it("skips a subscriber already on the annual price", () => {
    const plan = planSubscriptionMigration(
      subscription({ items: { data: [{ price: { id: ANNUAL_PRICE } }] } }),
      ANNUAL_PRICE,
    );

    expect(plan).toEqual({
      subscriptionId: "sub_1",
      action: "skip",
      reason: "already-annual",
    });
  });

  it("skips a subscription that already has a schedule attached", () => {
    const plan = planSubscriptionMigration(
      subscription({ schedule: "sub_sched_1" }),
      ANNUAL_PRICE,
    );

    expect(plan).toEqual({
      subscriptionId: "sub_1",
      action: "skip",
      reason: "already-scheduled",
    });
  });

  it("skips a subscription the customer has already cancelled", () => {
    const plan = planSubscriptionMigration(
      subscription({ cancel_at_period_end: true }),
      ANNUAL_PRICE,
    );

    expect(plan).toEqual({
      subscriptionId: "sub_1",
      action: "skip",
      reason: "cancelling",
    });
  });

  it.each(["canceled", "incomplete_expired", "unpaid"])(
    "skips a subscription in %s status",
    (status) => {
      const plan = planSubscriptionMigration(
        subscription({ status }),
        ANNUAL_PRICE,
      );

      expect(plan).toEqual({
        subscriptionId: "sub_1",
        action: "skip",
        reason: "inactive-status",
      });
    },
  );

  it.each(["active", "trialing", "past_due"])(
    "migrates a subscription in %s status",
    (status) => {
      const plan = planSubscriptionMigration(
        subscription({ status }),
        ANNUAL_PRICE,
      );

      expect(plan).toEqual({ subscriptionId: "sub_1", action: "migrate" });
    },
  );

  it("skips a multi-item subscription rather than guessing which item to reprice", () => {
    const plan = planSubscriptionMigration(
      subscription({
        items: {
          data: [{ price: { id: MONTHLY_PRICE } }, { price: { id: "price_addon" } }],
        },
      }),
      ANNUAL_PRICE,
    );

    expect(plan).toEqual({
      subscriptionId: "sub_1",
      action: "skip",
      reason: "multiple-items",
    });
  });
});

describe("buildAnnualScheduleUpdate", () => {
  function schedule(overrides: Partial<ScheduleSummary["phases"][0]> = {}): ScheduleSummary {
    return {
      phases: [
        {
          start_date: 1_750_000_000,
          end_date: 1_752_592_000,
          items: [{ price: MONTHLY_PRICE, quantity: 1 }],
          ...overrides,
        },
      ],
    };
  }

  it("keeps the current period untouched and appends the annual price after it", () => {
    const update = buildAnnualScheduleUpdate(schedule(), ANNUAL_PRICE);

    expect(update.phases).toHaveLength(2);
    expect(update.phases[0]).toMatchObject({
      start_date: 1_750_000_000,
      end_date: 1_752_592_000,
      items: [{ price: MONTHLY_PRICE, quantity: 1 }],
    });
    expect(update.phases[1]).toMatchObject({
      items: [{ price: ANNUAL_PRICE, quantity: 1 }],
    });
  });

  it("charges nothing at the switchover", () => {
    const update = buildAnnualScheduleUpdate(schedule(), ANNUAL_PRICE);

    expect(update.phases[1].proration_behavior).toBe("none");
  });

  it("leaves the annual phase open-ended so it renews forever", () => {
    const update = buildAnnualScheduleUpdate(schedule(), ANNUAL_PRICE);

    expect(update.phases[1]).not.toHaveProperty("duration");
    expect(update.phases[1]).not.toHaveProperty("end_date");
    expect(update.phases[1]).not.toHaveProperty("iterations");
  });

  it("releases the subscription instead of cancelling it when the schedule ends", () => {
    const update = buildAnnualScheduleUpdate(schedule(), ANNUAL_PRICE);

    expect(update.end_behavior).toBe("release");
  });

  // Stripe unsets any phase attribute omitted from an update. Echoing the
  // current phase back verbatim is the only thing standing between a
  // migration and a customer silently losing their discount.
  it("echoes the current phase's discounts back so the update does not strip them", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({ discounts: [{ coupon: "LAUNCH50" }] }),
      ANNUAL_PRICE,
    );

    expect(update.phases[0].discounts).toEqual([{ coupon: "LAUNCH50" }]);
  });

  it("echoes the current phase's metadata, tax rates and trial settings", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({
        metadata: { cohort: "founder" },
        default_tax_rates: ["txr_1"],
        trial_end: 1_751_000_000,
      }),
      ANNUAL_PRICE,
    );

    expect(update.phases[0]).toMatchObject({
      metadata: { cohort: "founder" },
      default_tax_rates: ["txr_1"],
      trial_end: 1_751_000_000,
    });
  });

  it("does not carry the current phase's trial into the annual phase", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({ trial_end: 1_751_000_000 }),
      ANNUAL_PRICE,
    );

    expect(update.phases[1]).not.toHaveProperty("trial_end");
  });

  it("carries the current item quantity onto the annual phase", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({ items: [{ price: MONTHLY_PRICE, quantity: 3 }] }),
      ANNUAL_PRICE,
    );

    expect(update.phases[1].items).toEqual([{ price: ANNUAL_PRICE, quantity: 3 }]);
  });

  it("rejects a schedule that has more than the one current phase", () => {
    const twoPhases: ScheduleSummary = {
      phases: [
        {
          start_date: 1,
          end_date: 2,
          items: [{ price: MONTHLY_PRICE, quantity: 1 }],
        },
        {
          start_date: 2,
          end_date: 3,
          items: [{ price: MONTHLY_PRICE, quantity: 1 }],
        },
      ],
    };

    expect(() => buildAnnualScheduleUpdate(twoPhases, ANNUAL_PRICE)).toThrow(
      /single current phase/i,
    );
  });
});
