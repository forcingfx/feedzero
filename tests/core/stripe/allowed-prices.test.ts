import { describe, it, expect } from "vitest";
import { resolveAllowedPrices } from "@/core/stripe/allowed-prices";

describe("resolveAllowedPrices", () => {
  it("returns an empty array when STRIPE_ALLOWED_PRICES is unset", () => {
    expect(resolveAllowedPrices({})).toEqual([]);
  });

  it("parses a comma-separated env var into trimmed price IDs", () => {
    const env = {
      STRIPE_ALLOWED_PRICES:
        "price_personal_monthly, price_personal_yearly,price_pro_monthly , price_pro_yearly",
    };
    expect(resolveAllowedPrices(env)).toEqual([
      "price_personal_monthly",
      "price_personal_yearly",
      "price_pro_monthly",
      "price_pro_yearly",
    ]);
  });

  it("filters out empty entries from leading/trailing commas", () => {
    const env = { STRIPE_ALLOWED_PRICES: ",price_a,, ,price_b," };
    expect(resolveAllowedPrices(env)).toEqual(["price_a", "price_b"]);
  });
});
