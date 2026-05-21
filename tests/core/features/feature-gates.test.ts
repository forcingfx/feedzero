import { describe, it, expect } from "vitest";
import {
  gateState,
  FEATURE_MAP,
  type Feature,
  type Tier,
} from "@/core/features/feature-gates";

const TIERS: Tier[] = ["free", "personal", "pro"];
const FEATURES = Object.keys(FEATURE_MAP) as Feature[];

describe("gateState — coming-soon features", () => {
  it("returns not-built for every coming-soon feature regardless of tier, self-hosted, or paid-tier-active", () => {
    const comingSoon = FEATURES.filter((f) => FEATURE_MAP[f].status === "coming-soon");
    expect(comingSoon.length).toBeGreaterThan(0);

    for (const feature of comingSoon) {
      for (const tier of TIERS) {
        for (const selfHosted of [true, false]) {
          for (const paidTierActive of [true, false]) {
            const state = gateState(feature, tier, selfHosted, paidTierActive);
            expect(state.enabled).toBe(false);
            expect(state.reason).toBe("not-built");
            expect(state.requiredTier).toBe(FEATURE_MAP[feature].requiredTier);
          }
        }
      }
    }
  });
});

describe("gateState — shipped features (paid tier active)", () => {
  it("auto-organize is shipped Personal-tier", () => {
    expect(FEATURE_MAP["auto-organize"]).toEqual({
      requiredTier: "personal",
      status: "shipped",
    });
  });

  it("free user without self-hosted → tier-locked for auto-organize", () => {
    expect(gateState("auto-organize", "free", false, true)).toEqual({
      enabled: false,
      reason: "tier-locked",
      requiredTier: "personal",
    });
  });

  it("personal user without self-hosted → ok for auto-organize", () => {
    expect(gateState("auto-organize", "personal", false, true)).toEqual({
      enabled: true,
      reason: "ok",
      requiredTier: "personal",
    });
  });

  it("pro user without self-hosted → ok for auto-organize (higher tier passes)", () => {
    expect(gateState("auto-organize", "pro", false, true)).toEqual({
      enabled: true,
      reason: "ok",
      requiredTier: "personal",
    });
  });

  it("free user with self-hosted → self-hosted-bypass for auto-organize", () => {
    expect(gateState("auto-organize", "free", true, true)).toEqual({
      enabled: true,
      reason: "self-hosted-bypass",
      requiredTier: "personal",
    });
  });

  it("personal user with self-hosted → self-hosted-bypass (flag wins over tier)", () => {
    expect(gateState("auto-organize", "personal", true, true)).toEqual({
      enabled: true,
      reason: "self-hosted-bypass",
      requiredTier: "personal",
    });
  });
});

describe("gateState — shipped features (paid tier inactive / pre-launch)", () => {
  it("free user → paid-tier-inactive bypass for every shipped Personal feature", () => {
    const shipped = FEATURES.filter((f) => FEATURE_MAP[f].status === "shipped");
    for (const feature of shipped) {
      const state = gateState(feature, "free", false, false);
      expect(state.enabled).toBe(true);
      expect(state.reason).toBe("paid-tier-inactive");
    }
  });

  it("coming-soon features stay not-built even when paid tier is inactive", () => {
    // Inactivating the paid tier mustn't pretend that code exists.
    // `search` is still gated coming-soon (per FEATURE_MAP). The old
    // `mute-keywords` entry was subsumed by `rules` when the per-feed
    // rules engine landed.
    const state = gateState("search", "free", false, false);
    expect(state.enabled).toBe(false);
    expect(state.reason).toBe("not-built");
  });
});

describe("gateState — full matrix sanity", () => {
  it("every (feature × tier × self-hosted × paid-tier-active) combination returns a well-formed GateState", () => {
    for (const feature of FEATURES) {
      for (const tier of TIERS) {
        for (const selfHosted of [true, false]) {
          for (const paidTierActive of [true, false]) {
            const state = gateState(feature, tier, selfHosted, paidTierActive);
            expect(typeof state.enabled).toBe("boolean");
            expect([
              "ok",
              "self-hosted-bypass",
              "paid-tier-inactive",
              "tier-locked",
              "not-built",
            ]).toContain(state.reason);
            expect(["free", "personal", "pro"]).toContain(state.requiredTier);
            if (state.enabled) {
              expect([
                "ok",
                "self-hosted-bypass",
                "paid-tier-inactive",
              ]).toContain(state.reason);
            } else {
              expect(["tier-locked", "not-built"]).toContain(state.reason);
            }
          }
        }
      }
    }
  });
});
