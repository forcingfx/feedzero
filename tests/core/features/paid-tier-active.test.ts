import { describe, it, expect, afterEach, vi } from "vitest";
import { isPaidTierActive } from "@/core/features/paid-tier-active";

describe("isPaidTierActive", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when VITE_PAID_TIER_VISIBLE is the string \"1\"", () => {
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "1");
    expect(isPaidTierActive()).toBe(true);
  });

  it("returns false when VITE_PAID_TIER_VISIBLE is unset (pre-launch default)", () => {
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "");
    expect(isPaidTierActive()).toBe(false);
  });

  it("returns false for truthy-but-not-\"1\" values (defensive — matches isSelfHosted convention)", () => {
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "true");
    expect(isPaidTierActive()).toBe(false);
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "yes");
    expect(isPaidTierActive()).toBe(false);
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "0");
    expect(isPaidTierActive()).toBe(false);
  });
});
