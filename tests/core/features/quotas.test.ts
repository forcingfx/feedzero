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
      });
      expect(result.ok).toBe(true);
    });

    it("allows the exact boundary add (24 → 25)", () => {
      const result = checkFeedQuota({
        currentCount: FREE_FEED_LIMIT - 1,
        tier: "free",
        isSelfHosted: false,
      });
      expect(result.ok).toBe(true);
    });

    it("blocks the add that would cross the limit (25 → 26)", () => {
      const result = checkFeedQuota({
        currentCount: FREE_FEED_LIMIT,
        tier: "free",
        isSelfHosted: false,
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
      // User has 20, importing 10 more would land at 30
      const result = checkFeedQuota({
        currentCount: 20,
        delta: 10,
        tier: "free",
        isSelfHosted: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.delta).toBe(10);
      }
    });

    it("allows bulk imports that land exactly at the limit", () => {
      const result = checkFeedQuota({
        currentCount: 15,
        delta: 10,
        tier: "free",
        isSelfHosted: false,
      });
      expect(result.ok).toBe(true);
    });

    it("blocks adds even at zero count if delta exceeds limit", () => {
      const result = checkFeedQuota({
        currentCount: 0,
        delta: 100,
        tier: "free",
        isSelfHosted: false,
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
      });
      expect(result.ok).toBe(true);
    });

    it("allows bulk imports with no count limit", () => {
      const result = checkFeedQuota({
        currentCount: 100,
        delta: 1000,
        tier: "personal",
        isSelfHosted: false,
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
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("self-hosted bypass", () => {
    it("allows adds for self-hosted Free user with high count", () => {
      const result = checkFeedQuota({
        currentCount: 5000,
        tier: "free",
        isSelfHosted: true,
      });
      expect(result.ok).toBe(true);
    });

    it("allows self-hosted bulk imports of any size", () => {
      const result = checkFeedQuota({
        currentCount: 0,
        delta: 10000,
        tier: "free",
        isSelfHosted: true,
      });
      expect(result.ok).toBe(true);
    });

    it("paid + self-hosted is still unlimited (precedence doesn't matter)", () => {
      const result = checkFeedQuota({
        currentCount: 999,
        tier: "personal",
        isSelfHosted: true,
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
      limit: 25,
      current: 25,
      delta: 1,
    });
    expect(msg).toContain("25 feeds");
    expect(msg).toContain("Personal");
    expect(msg).toContain("self-host");
  });

  it("formats a bulk-import message naming the import size", () => {
    const msg = quotaErrorMessage({
      ok: false,
      reason: "free-quota-exceeded",
      limit: 25,
      current: 10,
      delta: 20,
    });
    expect(msg).toContain("Importing 20 feeds");
    expect(msg).toContain("you have 10");
    expect(msg).toContain("Personal");
  });
});
