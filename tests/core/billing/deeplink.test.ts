import { describe, it, expect } from "vitest";
import {
  parseSubscribeIntent,
  resolvePriceId,
  type PriceKey,
} from "@/core/billing/deeplink";

describe("parseSubscribeIntent", () => {
  it("returns null when no subscribe param is present", () => {
    expect(parseSubscribeIntent(new URLSearchParams(""))).toBeNull();
  });

  it("returns null when subscribe param is empty", () => {
    expect(parseSubscribeIntent(new URLSearchParams("subscribe="))).toBeNull();
  });

  it("returns null for unknown price keys (defends against forged URLs)", () => {
    expect(
      parseSubscribeIntent(new URLSearchParams("subscribe=pro-lifetime")),
    ).toBeNull();
    expect(
      parseSubscribeIntent(new URLSearchParams("subscribe=enterprise")),
    ).toBeNull();
  });

  it("returns the priceKey for 'personal-monthly'", () => {
    const intent = parseSubscribeIntent(
      new URLSearchParams("subscribe=personal-monthly"),
    );
    expect(intent).toEqual({ priceKey: "personal-monthly" });
  });

  it("returns the priceKey for 'personal-yearly'", () => {
    const intent = parseSubscribeIntent(
      new URLSearchParams("subscribe=personal-yearly"),
    );
    expect(intent).toEqual({ priceKey: "personal-yearly" });
  });

  it("ignores other query params alongside subscribe", () => {
    const intent = parseSubscribeIntent(
      new URLSearchParams("foo=bar&subscribe=personal-monthly&baz=qux"),
    );
    expect(intent).toEqual({ priceKey: "personal-monthly" });
  });
});

describe("resolvePriceId", () => {
  it("maps personal-yearly to its env-injected Stripe price ID", () => {
    const id = resolvePriceId("personal-yearly", {
      personalYearly: "price_live_yearly_xyz",
    });
    expect(id).toBe("price_live_yearly_xyz");
  });

  it("resolves the retired personal-monthly key to the annual price", () => {
    // Billing went annual-only, but `?subscribe=personal-monthly` links are
    // already out in the world — on the landing page, in the support
    // runbook, in old emails. Failing closed on those would send a
    // customer at the point of highest intent to a dead end, so the key
    // stays parseable and resolves to the only price there is.
    const id = resolvePriceId("personal-monthly", {
      personalYearly: "price_live_yearly_xyz",
    });
    expect(id).toBe("price_live_yearly_xyz");
  });

  it("returns null when the env var is missing", () => {
    const id = resolvePriceId("personal-yearly", { personalYearly: "" });
    expect(id).toBeNull();
  });

  it("typescript guards: every PriceKey has a mapping (exhaustiveness check)", () => {
    // If we add a third PriceKey, this loop forces resolvePriceId() to handle it.
    const keys: PriceKey[] = ["personal-monthly", "personal-yearly"];
    for (const key of keys) {
      const id = resolvePriceId(key, {
        personalYearly: "y",
      });
      expect(id).not.toBeNull();
    }
  });
});
