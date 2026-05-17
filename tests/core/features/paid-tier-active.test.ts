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

  it("returns false when VITE_SELF_HOSTED=1 even if VITE_PAID_TIER_VISIBLE=1 (master switch)", () => {
    // Self-hosters never have an upgrade path. The single-switch invariant
    // says VITE_SELF_HOSTED=1 hides every paid-tier surface, regardless of
    // any other flag. Locks the master-switch contract from ADR 014.
    vi.stubEnv("VITE_SELF_HOSTED", "1");
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "1");
    expect(isPaidTierActive()).toBe(false);
  });
});
