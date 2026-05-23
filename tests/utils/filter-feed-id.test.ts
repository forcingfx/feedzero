import { describe, it, expect } from "vitest";
import {
  FILTER_FEED_PREFIX,
  toFilterFeedId,
  isFilterFeedId,
  fromFilterFeedId,
  isAggregatedFeedId,
  isStarredFeedId,
  isFolderFeedId,
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFolderFeedId,
} from "@feedzero/core/utils/constants";

describe("FILTER_FEED_PREFIX and helpers", () => {
  it("toFilterFeedId prefixes a filter id with 'filter:'", () => {
    expect(toFilterFeedId("abc")).toBe("filter:abc");
    expect(toFilterFeedId("abc")).toMatch(new RegExp(`^${FILTER_FEED_PREFIX}`));
  });

  it("isFilterFeedId is true for prefixed ids and false for anything else", () => {
    expect(isFilterFeedId(toFilterFeedId("abc"))).toBe(true);
    expect(isFilterFeedId(ALL_FEEDS_ID)).toBe(false);
    expect(isFilterFeedId(STARRED_FEED_ID)).toBe(false);
    expect(isFilterFeedId(toFolderFeedId("tech"))).toBe(false);
    expect(isFilterFeedId("plain-feed-id")).toBe(false);
  });

  it("fromFilterFeedId strips the prefix and returns the inner id", () => {
    expect(fromFilterFeedId("filter:abc")).toBe("abc");
    expect(fromFilterFeedId("filter:")).toBe("");
    expect(fromFilterFeedId(ALL_FEEDS_ID)).toBeNull();
    expect(fromFilterFeedId("plain-feed-id")).toBeNull();
  });

  it("none of the four virtual-feed kinds collide with each other", () => {
    // Tripwire — if anyone changes FILTER_FEED_PREFIX to a value that
    // overlaps with a folder feed id, isAggregatedFeedId would still
    // return true but per-branch handlers would dispatch the wrong way.
    const folder = toFolderFeedId("a");
    const filter = toFilterFeedId("a");
    const ids = new Set([ALL_FEEDS_ID, STARRED_FEED_ID, folder, filter]);
    expect(ids.size).toBe(4);
    expect(isFolderFeedId(filter)).toBe(false);
    expect(isFilterFeedId(folder)).toBe(false);
  });
});

describe("isAggregatedFeedId — extended to include filter feeds", () => {
  it("returns true for filter ids", () => {
    expect(isAggregatedFeedId(toFilterFeedId("abc"))).toBe(true);
  });

  it("still returns true for the existing aggregated kinds", () => {
    expect(isAggregatedFeedId(ALL_FEEDS_ID)).toBe(true);
    expect(isAggregatedFeedId(STARRED_FEED_ID)).toBe(true);
    expect(isAggregatedFeedId(toFolderFeedId("tech"))).toBe(true);
  });

  it("returns false for concrete feed ids", () => {
    expect(isAggregatedFeedId("feed-123")).toBe(false);
  });

  it("isStarredFeedId still distinguishes the starred view from filter views", () => {
    expect(isStarredFeedId(STARRED_FEED_ID)).toBe(true);
    expect(isStarredFeedId(toFilterFeedId("starred"))).toBe(false);
  });
});
