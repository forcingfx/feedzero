import { describe, it, expect, beforeEach } from "vitest";
import {
  signalRateLimited,
  isInCooldown,
  clearCooldown,
  cooldownRemainingMs,
} from "@/core/extractor/prefetch-cooldown";

describe("prefetch-cooldown", () => {
  beforeEach(() => {
    clearCooldown();
  });

  it("is not in cooldown by default", () => {
    expect(isInCooldown()).toBe(false);
    expect(cooldownRemainingMs()).toBe(0);
  });

  it("signalRateLimited puts us in cooldown for the given window", () => {
    const now = 1_000_000;
    signalRateLimited(30, now);
    expect(isInCooldown(now)).toBe(true);
    expect(isInCooldown(now + 29_999)).toBe(true);
    expect(isInCooldown(now + 30_001)).toBe(false);
  });

  it("cooldownRemainingMs reports the time left in the window", () => {
    const now = 1_000_000;
    signalRateLimited(60, now);
    expect(cooldownRemainingMs(now)).toBe(60_000);
    expect(cooldownRemainingMs(now + 20_000)).toBe(40_000);
    expect(cooldownRemainingMs(now + 60_001)).toBe(0);
  });

  it("clamps remaining to 0 once the window has elapsed", () => {
    const now = 1_000_000;
    signalRateLimited(5, now);
    expect(cooldownRemainingMs(now + 999_999)).toBe(0);
  });

  it("a longer signal extends the cooldown — never shortens it", () => {
    // Both prefetch and the user click can observe 429s. If a long
    // Retry-After lands and is followed by a short one, we keep the
    // longer window so prefetch doesn't resume mid-block.
    const now = 1_000_000;
    signalRateLimited(60, now);
    signalRateLimited(5, now + 1000);
    expect(cooldownRemainingMs(now + 1000)).toBe(59_000);
  });

  it("ignores a non-positive retryAfter (defensive — bad upstream header)", () => {
    const now = 1_000_000;
    signalRateLimited(0, now);
    expect(isInCooldown(now)).toBe(false);
    signalRateLimited(-5, now);
    expect(isInCooldown(now)).toBe(false);
  });

  it("clearCooldown resets state", () => {
    signalRateLimited(60, 1_000_000);
    clearCooldown();
    expect(isInCooldown(1_000_000)).toBe(false);
  });
});
