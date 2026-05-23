import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  effectiveRefreshIntervalMs,
  isFeedDueForRefresh,
} from "@/core/feeds/refresh-backoff";
import type { Feed } from "@/types";

function buildFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f1",
    url: "https://example.com/feed.xml",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const DEFAULT_MS = 30 * 60 * 1000;

describe("effectiveRefreshIntervalMs", () => {
  it("returns the default interval when consecutive304Count is undefined", () => {
    const feed = buildFeed();
    expect(effectiveRefreshIntervalMs(feed, DEFAULT_MS)).toBe(DEFAULT_MS);
  });

  it("returns the default interval below the backoff threshold", () => {
    expect(
      effectiveRefreshIntervalMs(
        buildFeed({ consecutive304Count: 0 }),
        DEFAULT_MS,
      ),
    ).toBe(DEFAULT_MS);
    expect(
      effectiveRefreshIntervalMs(
        buildFeed({ consecutive304Count: 2 }),
        DEFAULT_MS,
      ),
    ).toBe(DEFAULT_MS);
  });

  it("doubles the interval at exactly 3 consecutive 304s", () => {
    expect(
      effectiveRefreshIntervalMs(
        buildFeed({ consecutive304Count: 3 }),
        DEFAULT_MS,
      ),
    ).toBe(DEFAULT_MS * 2);
  });

  it("quadruples the interval at 4+ consecutive 304s and caps there", () => {
    expect(
      effectiveRefreshIntervalMs(
        buildFeed({ consecutive304Count: 4 }),
        DEFAULT_MS,
      ),
    ).toBe(DEFAULT_MS * 4);
    expect(
      effectiveRefreshIntervalMs(
        buildFeed({ consecutive304Count: 50 }),
        DEFAULT_MS,
      ),
    ).toBe(DEFAULT_MS * 4);
  });
});

describe("isFeedDueForRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T00:00:00Z"));
  });

  it("is due when the feed has never been refreshed", () => {
    expect(
      isFeedDueForRefresh(buildFeed(), Date.now(), DEFAULT_MS),
    ).toBe(true);
  });

  it("is due when the last refresh is older than the effective interval", () => {
    const feed = buildFeed({
      lastFetchedAt: Date.now() - DEFAULT_MS - 1,
    });
    expect(isFeedDueForRefresh(feed, Date.now(), DEFAULT_MS)).toBe(true);
  });

  it("is not due when the last refresh is younger than the effective interval", () => {
    const feed = buildFeed({
      lastFetchedAt: Date.now() - 60_000,
    });
    expect(isFeedDueForRefresh(feed, Date.now(), DEFAULT_MS)).toBe(false);
  });

  it("respects the extended interval from consecutive 304s", () => {
    // Backoff to 2× (60 min); a feed refreshed 35 min ago is NOT due.
    const feed = buildFeed({
      lastFetchedAt: Date.now() - 35 * 60 * 1000,
      consecutive304Count: 3,
    });
    expect(isFeedDueForRefresh(feed, Date.now(), DEFAULT_MS)).toBe(false);

    // …same feed at 65 min IS due.
    const stale = buildFeed({
      lastFetchedAt: Date.now() - 65 * 60 * 1000,
      consecutive304Count: 3,
    });
    expect(isFeedDueForRefresh(stale, Date.now(), DEFAULT_MS)).toBe(true);
  });
});
