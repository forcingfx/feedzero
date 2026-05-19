import { describe, it, expect } from "vitest";
import { gateState, FEATURE_MAP } from "@/core/features/feature-gates";

/**
 * The full matrix coverage lives in feature-gates.test.ts. This file pins
 * the tier + status decisions for offline-prefetch explicitly so a future
 * refactor can't silently drop the feature from Personal or revert it to
 * coming-soon.
 */
describe("offline-prefetch feature gate", () => {
  it("is registered as shipped at the Personal tier", () => {
    expect(FEATURE_MAP["offline-prefetch"]).toEqual({
      requiredTier: "personal",
      status: "shipped",
    });
  });

  it("free user without self-hosted bypass is tier-locked when paid tier is active", () => {
    const state = gateState("offline-prefetch", "free", false, true);
    expect(state.enabled).toBe(false);
    expect(state.reason).toBe("tier-locked");
    expect(state.requiredTier).toBe("personal");
  });

  it("personal user with paid tier active is ok", () => {
    const state = gateState("offline-prefetch", "personal", false, true);
    expect(state.enabled).toBe(true);
    expect(state.reason).toBe("ok");
  });

  it("self-hosted user bypasses the tier check", () => {
    const state = gateState("offline-prefetch", "free", true, true);
    expect(state.enabled).toBe(true);
    expect(state.reason).toBe("self-hosted-bypass");
  });

  it("paid tier inactive opens the gate to everyone (pre-launch)", () => {
    const state = gateState("offline-prefetch", "free", false, false);
    expect(state.enabled).toBe(true);
    expect(state.reason).toBe("paid-tier-inactive");
  });
});
