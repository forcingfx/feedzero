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

  // No duration is sent, so Stripe gives the phase one billing period and then
  // ends the schedule. Paired with end_behavior "release" the subscription is
  // handed back still on the annual price and keeps renewing — verified
  // against a real subscription, where phase 1 came back as a bounded year.
  it("sends no duration for the annual phase", () => {
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

  // Stripe's SDK serializes a null field to an empty string, and Stripe reads
  // an empty string as "unset this parameter" — which it then refuses for
  // fields that cannot be unset. A schedule created with `from_subscription`
  // comes back with many nulls (`application_fee_percent`, `billing_thresholds`,
  // `on_behalf_of`, `transfer_data`, and `collection_method` when the
  // subscription bills by charge), so echoing the phase verbatim fails with
  // "You passed an empty string for 'phases[0][collection_method]'".
  it("drops null and undefined fields from the echoed phase", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({
        collection_method: null,
        application_fee_percent: null,
        on_behalf_of: undefined,
      }),
      ANNUAL_PRICE,
    );

    expect(update.phases[0]).not.toHaveProperty("collection_method");
    expect(update.phases[0]).not.toHaveProperty("application_fee_percent");
    expect(update.phases[0]).not.toHaveProperty("on_behalf_of");
  });

  // Stripe returns each discount as {coupon, discount, promotion_code} with the
  // two unused slots null. Echoed back verbatim that trips
  // "You may only specify one of these parameters: coupon, discount,
  // promotion_code" — so the strip has to reach inside arrays and nested
  // objects, not just the phase's own keys.
  it("strips nulls nested inside arrays and objects", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({
        discounts: [
          { coupon: "LAUNCH50", discount: null, promotion_code: null },
        ],
        automatic_tax: { enabled: false, disabled_reason: null, liability: null },
        items: [
          {
            price: MONTHLY_PRICE,
            quantity: 1,
            billing_thresholds: null,
            metadata: {},
          },
        ],
      }),
      ANNUAL_PRICE,
    );

    expect(update.phases[0].discounts).toEqual([{ coupon: "LAUNCH50" }]);
    expect(update.phases[0].automatic_tax).toEqual({ enabled: false });
    expect(update.phases[0].items).toEqual([
      { price: MONTHLY_PRICE, quantity: 1, metadata: {} },
    ]);
  });

  it("keeps a field whose value is legitimately falsy but not null", () => {
    const update = buildAnnualScheduleUpdate(
      schedule({ application_fee_percent: 0, metadata: {} }),
      ANNUAL_PRICE,
    );

    expect(update.phases[0].application_fee_percent).toBe(0);
    expect(update.phases[0].metadata).toEqual({});
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
