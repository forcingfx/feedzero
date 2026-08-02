import { describe, it, expect } from "vitest";
import {
  recordRecentFeed,
  stableDockFeeds,
  MOBILE_DOCK_FEED_CAP,
  RECENT_LIST_CAP,
} from "../../src/lib/recent-feeds.ts";
import type { Feed } from "@feedzero/core/types";

const feed = (id: string): Feed => ({
  id,
  url: `https://${id}.com/feed`,
  title: id.toUpperCase(),
  description: "",
  siteUrl: `https://${id}.com`,
  createdAt: 0,
  updatedAt: 0,
});

describe("recordRecentFeed", () => {
  it("prepends a newly viewed feed as most-recent", () => {
    expect(recordRecentFeed(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("moves an already-seen feed to the front without duplicating it", () => {
    expect(recordRecentFeed(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("is a no-op on order when the feed is already most-recent", () => {
    expect(recordRecentFeed(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("caps the persisted list length", () => {
    const long = Array.from({ length: RECENT_LIST_CAP + 5 }, (_, i) => `f${i}`);
    const result = recordRecentFeed(long, "new");
    expect(result).toHaveLength(RECENT_LIST_CAP);
    expect(result[0]).toBe("new");
  });
});

describe("MOBILE_DOCK_FEED_CAP", () => {
  it("is a small positive cap so the closed dock never overflows the strip", () => {
    expect(MOBILE_DOCK_FEED_CAP).toBeGreaterThan(0);
    expect(MOBILE_DOCK_FEED_CAP).toBeLessThanOrEqual(8);
  });
});

describe("stableDockFeeds", () => {
  const feeds = [feed("a"), feed("b"), feed("c"), feed("d"), feed("e"), feed("f")];

  it("recency decides membership, sidebar order decides position", () => {
    // e and c are the most recent — both make the dock — but they render
    // in feeds order (c before e), not recency order.
    const dock = stableDockFeeds(feeds, ["e", "c"], 4);
    expect(dock.map((f) => f.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("tapping a feed already in the dock never reorders the dock", () => {
    const before = stableDockFeeds(feeds, ["e", "c", "a", "b"], 4);
    // Viewing "c" promotes it in the recency list…
    const after = stableDockFeeds(
      feeds,
      recordRecentFeed(["e", "c", "a", "b"], "c"),
      4,
    );
    // …but the dock must not move under the user's thumb.
    expect(after.map((f) => f.id)).toEqual(before.map((f) => f.id));
  });

  it("viewing a feed outside the dock swaps out the least-recent member only", () => {
    const before = stableDockFeeds(feeds, ["a", "b", "c", "d"], 4);
    expect(before.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);

    const after = stableDockFeeds(
      feeds,
      recordRecentFeed(["a", "b", "c", "d"], "f"),
      4,
    );
    // f enters (at its sidebar-order slot), d — least recent — leaves;
    // a, b, c keep their relative positions.
    expect(after.map((f) => f.id)).toEqual(["a", "b", "c", "f"]);
  });

  it("fills spare slots with never-viewed feeds in sidebar order", () => {
    const dock = stableDockFeeds(feeds, ["d"], 3);
    expect(dock.map((f) => f.id)).toEqual(["a", "b", "d"]);
  });

  it("ignores recency ids for deleted feeds", () => {
    const dock = stableDockFeeds(feeds.slice(0, 2), ["ghost", "b"], 2);
    expect(dock.map((f) => f.id)).toEqual(["a", "b"]);
  });
});
