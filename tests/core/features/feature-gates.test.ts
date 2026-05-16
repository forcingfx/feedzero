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
  it("returns not-built for every coming-soon feature regardless of tier or self-hosted", () => {
    const comingSoon = FEATURES.filter((f) => FEATURE_MAP[f].status === "coming-soon");
    expect(comingSoon.length).toBeGreaterThan(0);

    for (const feature of comingSoon) {
      for (const tier of TIERS) {
        for (const selfHosted of [true, false]) {
          const state = gateState(feature, tier, selfHosted);
          expect(state.enabled).toBe(false);
          expect(state.reason).toBe("not-built");
          expect(state.requiredTier).toBe(FEATURE_MAP[feature].requiredTier);
        }
      }
    }
  });
});

describe("gateState — shipped features", () => {
  it("auto-organize is shipped Personal-tier", () => {
    expect(FEATURE_MAP["auto-organize"]).toEqual({
      requiredTier: "personal",
      status: "shipped",
    });
  });

  it("cloud-sync is shipped Personal-tier", () => {
    expect(FEATURE_MAP["cloud-sync"]).toEqual({
      requiredTier: "personal",
      status: "shipped",
    });
  });

  it("free user without self-hosted → tier-locked for auto-organize", () => {
    expect(gateState("auto-organize", "free", false)).toEqual({
      enabled: false,
      reason: "tier-locked",
      requiredTier: "personal",
    });
  });

  it("personal user without self-hosted → ok for auto-organize", () => {
    expect(gateState("auto-organize", "personal", false)).toEqual({
      enabled: true,
      reason: "ok",
      requiredTier: "personal",
    });
  });

  it("pro user without self-hosted → ok for auto-organize (higher tier passes)", () => {
    expect(gateState("auto-organize", "pro", false)).toEqual({
      enabled: true,
      reason: "ok",
      requiredTier: "personal",
    });
  });

  it("free user with self-hosted → self-hosted-bypass for auto-organize", () => {
    expect(gateState("auto-organize", "free", true)).toEqual({
      enabled: true,
      reason: "self-hosted-bypass",
      requiredTier: "personal",
    });
  });

  it("personal user with self-hosted → self-hosted-bypass (flag wins over tier)", () => {
    expect(gateState("auto-organize", "personal", true)).toEqual({
      enabled: true,
      reason: "self-hosted-bypass",
      requiredTier: "personal",
    });
  });
});

describe("gateState — full matrix sanity", () => {
  it("every (feature × tier × self-hosted) combination returns a well-formed GateState", () => {
    for (const feature of FEATURES) {
      for (const tier of TIERS) {
        for (const selfHosted of [true, false]) {
          const state = gateState(feature, tier, selfHosted);
          expect(typeof state.enabled).toBe("boolean");
          expect(["ok", "self-hosted-bypass", "tier-locked", "not-built"]).toContain(
            state.reason,
          );
          expect(["free", "personal", "pro"]).toContain(state.requiredTier);
          // Consistency: enabled <=> reason is one of ok/self-hosted-bypass.
          if (state.enabled) {
            expect(["ok", "self-hosted-bypass"]).toContain(state.reason);
          } else {
            expect(["tier-locked", "not-built"]).toContain(state.reason);
          }
        }
      }
    }
  });
});
