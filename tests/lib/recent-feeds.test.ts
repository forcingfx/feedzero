import { describe, it, expect } from "vitest";
import {
  recordRecentFeed,
  orderFeedsByRecency,
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

describe("orderFeedsByRecency", () => {
  it("orders feeds most-recently-viewed first", () => {
    const feeds = [feed("a"), feed("b"), feed("c")];
    const ordered = orderFeedsByRecency(feeds, ["c", "a"]);
    expect(ordered.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it("appends never-viewed feeds in their incoming order after recent ones", () => {
    const feeds = [feed("a"), feed("b"), feed("c"), feed("d")];
    const ordered = orderFeedsByRecency(feeds, ["d"]);
    expect(ordered.map((f) => f.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("drops recency ids that no longer correspond to a feed", () => {
    const feeds = [feed("a"), feed("b")];
    const ordered = orderFeedsByRecency(feeds, ["gone", "b"]);
    expect(ordered.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("returns feeds in their original order when nothing has been viewed", () => {
    const feeds = [feed("a"), feed("b")];
    expect(orderFeedsByRecency(feeds, []).map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("MOBILE_DOCK_FEED_CAP", () => {
  it("is a small positive cap so the closed dock never overflows the strip", () => {
    expect(MOBILE_DOCK_FEED_CAP).toBeGreaterThan(0);
    expect(MOBILE_DOCK_FEED_CAP).toBeLessThanOrEqual(8);
  });
});
