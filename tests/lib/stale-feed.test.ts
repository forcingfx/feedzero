import { describe, it, expect } from "vitest";
import {
  isFeedStale,
  STALE_FEED_THRESHOLD_MS,
} from "../../src/lib/stale-feed.ts";
import type { Feed } from "@feedzero/core/types";

const baseFeed: Feed = {
  id: "f1",
  url: "https://example.com/feed.xml",
  title: "Example",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 0,
  updatedAt: 0,
};

describe("isFeedStale", () => {
  it("a brand-new feed (never refreshed) is not stale", () => {
    expect(isFeedStale({ ...baseFeed })).toBe(false);
  });

  it("a recently successful feed is not stale", () => {
    const now = 1_700_000_000_000;
    expect(
      isFeedStale(
        {
          ...baseFeed,
          lastFetchedAt: now,
          lastSuccessfulFetchAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it("a feed whose last success was just over 14 days ago is stale", () => {
    const now = 1_700_000_000_000;
    expect(
      isFeedStale(
        {
          ...baseFeed,
          lastFetchedAt: now,
          lastSuccessfulFetchAt: now - STALE_FEED_THRESHOLD_MS - 1,
        },
        now,
      ),
    ).toBe(true);
  });

  it("a feed that was tried recently but has never succeeded is stale only after the first attempt ages out", () => {
    const now = 1_700_000_000_000;
    const recentAttempt = {
      ...baseFeed,
      lastFetchedAt: now - 1000, // tried 1 second ago, never succeeded
    };
    expect(isFeedStale(recentAttempt, now)).toBe(false);

    const oldAttempt = {
      ...baseFeed,
      lastFetchedAt: now - STALE_FEED_THRESHOLD_MS - 1,
    };
    expect(isFeedStale(oldAttempt, now)).toBe(true);
  });
});
