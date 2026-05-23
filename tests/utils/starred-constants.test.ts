import { describe, it, expect } from "vitest";
import {
  STARRED_FEED_ID,
  ALL_FEEDS_ID,
  isAggregatedFeedId,
  isStarredFeedId,
  toFolderFeedId,
} from "@feedzero/core/utils/constants";

describe("STARRED_FEED_ID", () => {
  it("is a stable string distinct from ALL_FEEDS_ID and folder feed ids", () => {
    expect(typeof STARRED_FEED_ID).toBe("string");
    expect(STARRED_FEED_ID.length).toBeGreaterThan(0);
    expect(STARRED_FEED_ID).not.toBe(ALL_FEEDS_ID);
    expect(STARRED_FEED_ID.startsWith("folder:")).toBe(false);
  });

  it("isStarredFeedId returns true only for STARRED_FEED_ID", () => {
    expect(isStarredFeedId(STARRED_FEED_ID)).toBe(true);
    expect(isStarredFeedId(ALL_FEEDS_ID)).toBe(false);
    expect(isStarredFeedId(toFolderFeedId("tech"))).toBe(false);
    expect(isStarredFeedId("some-feed-id")).toBe(false);
  });

  it("isAggregatedFeedId returns true for STARRED_FEED_ID (articles span many feeds)", () => {
    // Starred view collects articles from every feed, like ALL_FEEDS_ID and
    // folder views. Components that show per-article provenance (favicon +
    // feed title) rely on this flag.
    expect(isAggregatedFeedId(STARRED_FEED_ID)).toBe(true);
  });
});
