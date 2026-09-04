/**
 * Price-copy tripwire.
 *
 * The amount used to live in eight independent JSX literals across three
 * components with no shared constant and no test at all — which is how
 * `$19/month` survived in `subscription-tab.tsx` long after every other
 * surface said Pro was "Coming 2026". These assertions exist so the next
 * price change is a deliberate edit here rather than a grep-and-hope.
 */
import { describe, it, expect } from "vitest";
import { PAID_PLAN } from "@/core/features/pricing";

describe("PAID_PLAN", () => {
  it("prices the paid plan at $9 per year", () => {
    expect(PAID_PLAN.amount).toBe("$9");
    expect(PAID_PLAN.period).toBe("year");
  });

  it("exposes a ready-to-render display string", () => {
    // Every price surface renders this rather than composing its own —
    // that is the whole point of the module.
    expect(PAID_PLAN.display).toBe("$9/year");
  });

  it("sets the free trial at 14 days", () => {
    expect(PAID_PLAN.trialDays).toBe(14);
  });

  it("keeps the trial length a non-zero integer", () => {
    // Stripe rejects `trial_period_days: 0`, so zero is not a valid
    // off-switch — sunsetting the trial means removing `subscription_data`
    // from the Checkout call, not setting this to 0.
    expect(Number.isInteger(PAID_PLAN.trialDays)).toBe(true);
    expect(PAID_PLAN.trialDays).toBeGreaterThan(0);
  });
});
