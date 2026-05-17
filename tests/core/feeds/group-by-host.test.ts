import { describe, it, expect } from "vitest";
import { groupByHostForRefresh } from "@/core/feeds/group-by-host";

describe("groupByHostForRefresh", () => {
  it("returns one batch when every feed is on a different host", () => {
    // Cross-host parallelism is preserved — there's no reason to slow down
    // refreshes against unrelated upstreams just because we also need to
    // be polite to one of them.
    const feeds = [
      { url: "https://a.example.com/feed.xml" },
      { url: "https://b.example.com/feed.xml" },
      { url: "https://c.example.com/feed.xml" },
    ];
    const batches = groupByHostForRefresh(feeds, 5);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("places same-host feeds in separate batches (per-host serialization)", () => {
    // Three feeds on feeds.feedburner.com should refresh sequentially,
    // not as a 3-burst. Otherwise we trip upstream rate limits — the
    // self-host symptom from feedback #97.
    const feeds = [
      { url: "https://feeds.feedburner.com/a" },
      { url: "https://feeds.feedburner.com/b" },
      { url: "https://feeds.feedburner.com/c" },
    ];
    const batches = groupByHostForRefresh(feeds, 5);
    expect(batches).toHaveLength(3);
    for (const batch of batches) expect(batch).toHaveLength(1);
  });

  it("packs different hosts into the same batch up to the concurrency limit", () => {
    const feeds = [
      { url: "https://a.example.com/1" },
      { url: "https://a.example.com/2" }, // dup host of a
      { url: "https://b.example.com/1" },
      { url: "https://c.example.com/1" },
      { url: "https://d.example.com/1" },
    ];
    const batches = groupByHostForRefresh(feeds, 3);
    // Batch 1: a/1, b, c (limit reached)
    // Batch 2: a/2, d
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(3);
    expect(batches[1]).toHaveLength(2);
    const batch0Hosts = batches[0].map((f) => new URL(f.url).host);
    expect(new Set(batch0Hosts).size).toBe(batch0Hosts.length);
  });

  it("invalid URLs go in their own singleton batch (don't drop them silently)", () => {
    const feeds = [
      { url: "https://a.example.com/1" },
      { url: "not-a-url" },
    ];
    const batches = groupByHostForRefresh(feeds, 5);
    expect(batches.flat()).toHaveLength(2);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByHostForRefresh([], 5)).toEqual([]);
  });
});
