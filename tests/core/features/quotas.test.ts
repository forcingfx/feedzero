import { describe, it, expect } from "vitest";
import {
  FREE_FEED_LIMIT,
  checkFeedQuota,
  quotaErrorMessage,
} from "@/core/features/quotas";

describe("checkFeedQuota", () => {
  describe("free tier (hosted)", () => {
    it("allows adds when under the limit", () => {
      const result = checkFeedQuota({
        currentCount: 10,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("allows the exact boundary add (49 → 50)", () => {
      const result = checkFeedQuota({
        currentCount: FREE_FEED_LIMIT - 1,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("blocks the add that would cross the limit (50 → 51)", () => {
      const result = checkFeedQuota({
        currentCount: FREE_FEED_LIMIT,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("free-quota-exceeded");
        expect(result.limit).toBe(FREE_FEED_LIMIT);
        expect(result.current).toBe(FREE_FEED_LIMIT);
        expect(result.delta).toBe(1);
      }
    });

    it("blocks bulk imports that would exceed the limit", () => {
      // User has 40, importing 20 more would land at 60 — over the 50 cap.
      const result = checkFeedQuota({
        currentCount: 40,
        delta: 20,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.delta).toBe(20);
      }
    });

    it("allows bulk imports that land exactly at the limit", () => {
      const result = checkFeedQuota({
        currentCount: 30,
        delta: 20,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("blocks adds even at zero count if delta exceeds limit", () => {
      const result = checkFeedQuota({
        currentCount: 0,
        delta: 100,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("personal tier", () => {
    it("allows adds with no count limit", () => {
      const result = checkFeedQuota({
        currentCount: 5000,
        tier: "personal",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("allows bulk imports with no count limit", () => {
      const result = checkFeedQuota({
        currentCount: 100,
        delta: 1000,
        tier: "personal",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("pro tier", () => {
    it("allows adds with no count limit", () => {
      const result = checkFeedQuota({
        currentCount: 5000,
        tier: "pro",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("paid-tier-inactive bypass (pre-launch / paid tier dormant)", () => {
    it("allows free users to add feeds with no count limit when paid tier is inactive", () => {
      const result = checkFeedQuota({
        currentCount: 5000,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: false,
      });
      expect(result.ok).toBe(true);
    });

    it("allows free-tier bulk imports of any size when paid tier is inactive", () => {
      const result = checkFeedQuota({
        currentCount: 0,
        delta: 10000,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: false,
      });
      expect(result.ok).toBe(true);
    });

    it("still enforces the cap when paid tier IS active and user is free + not self-hosted", () => {
      const result = checkFeedQuota({
        currentCount: FREE_FEED_LIMIT,
        tier: "free",
        isSelfHosted: false,
        paidTierActive: true,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("self-hosted bypass", () => {
    it("allows adds for self-hosted Free user with high count", () => {
      const result = checkFeedQuota({
        currentCount: 5000,
        tier: "free",
        isSelfHosted: true,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("allows self-hosted bulk imports of any size", () => {
      const result = checkFeedQuota({
        currentCount: 0,
        delta: 10000,
        tier: "free",
        isSelfHosted: true,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });

    it("paid + self-hosted is still unlimited (precedence doesn't matter)", () => {
      const result = checkFeedQuota({
        currentCount: 999,
        tier: "personal",
        isSelfHosted: true,
        paidTierActive: true,
      });
      expect(result.ok).toBe(true);
    });
  });
});

describe("quotaErrorMessage", () => {
  it("formats a single-add message", () => {
    const msg = quotaErrorMessage({
      ok: false,
      reason: "free-quota-exceeded",
      limit: 50,
      current: 50,
      delta: 1,
    });
    expect(msg).toContain("50 feeds");
    expect(msg).toContain("Personal");
    expect(msg).toContain("self-host");
  });

  it("formats a bulk-import message naming the import size", () => {
    const msg = quotaErrorMessage({
      ok: false,
      reason: "free-quota-exceeded",
      limit: 50,
      current: 10,
      delta: 30,
    });
    expect(msg).toContain("Importing 30 feeds");
    expect(msg).toContain("you have 10");
    expect(msg).toContain("Personal");
  });
});
