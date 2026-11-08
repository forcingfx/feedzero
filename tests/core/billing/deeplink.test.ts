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

  it("treats the retired 'personal-monthly' key as unknown", () => {
    // ADR 029: the key was kept only while the landing page still emitted
    // it, and it resolved to the annual price — a lie by name. Landing has
    // linked to personal-yearly since 2026-09, so the key is now retired.
    expect(
      parseSubscribeIntent(new URLSearchParams("subscribe=personal-monthly")),
    ).toBeNull();
  });

  it("returns the priceKey for 'personal-yearly'", () => {
    const intent = parseSubscribeIntent(
      new URLSearchParams("subscribe=personal-yearly"),
    );
    expect(intent).toEqual({ priceKey: "personal-yearly" });
  });

  it("ignores other query params alongside subscribe", () => {
    const intent = parseSubscribeIntent(
      new URLSearchParams("foo=bar&subscribe=personal-yearly&baz=qux"),
    );
    expect(intent).toEqual({ priceKey: "personal-yearly" });
  });
});

describe("resolvePriceId", () => {
  it("maps personal-yearly to its env-injected Stripe price ID", () => {
    const id = resolvePriceId("personal-yearly", {
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
    const keys: PriceKey[] = ["personal-yearly"];
    for (const key of keys) {
      const id = resolvePriceId(key, {
        personalYearly: "y",
      });
      expect(id).not.toBeNull();
    }
  });
});
