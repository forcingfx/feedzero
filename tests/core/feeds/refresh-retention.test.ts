/**
 * Retention at ingest: a refresh must not re-add what the purge removed.
 *
 * Refresh dedupes only against stored rows, so without these rules a
 * purged article that is still in the publisher's feed comes straight
 * back as new and unread on the next refresh. Dated items are filtered
 * by age; undated items (whose date is "first seen", so they always look
 * new) are remembered by guid until they leave the feed.
 *
 * Network mocked at `fetch`; real encrypted db via fake-indexeddb.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  addFeed,
  getAllArticles,
  getFeed,
  putPreferences,
} from "@/core/storage/db";
import { addFeedFlow, refreshFeed, reloadFeed } from "@/core/feeds/feed-service";
import { purgeExpiredArticles } from "@/core/storage/article-retention";
import { createFeed } from "@/core/storage/schema";
import { unwrap } from "@feedzero/core/utils/result";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import type { Feed } from "@feedzero/core/types";

const DAY = 24 * 60 * 60 * 1000;
const FEED_URL = "https://slow.example/feed.xml";

interface Item {
  guid: string;
  /** Days before now; omit for an item without a pubDate. */
  ageDays?: number;
}

function rss(items: Item[]): string {
  const entries = items
    .map(({ guid, ageDays }) => {
      const date =
        ageDays === undefined
          ? ""
          : `<pubDate>${new Date(Date.now() - ageDays * DAY).toUTCString()}</pubDate>`;
      return `<item><title>${guid}</title><link>https://slow.example/${guid}</link><guid>${guid}</guid>${date}</item>`;
    })
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Slow</title><link>https://slow.example</link><description>d</description>${entries}</channel></rss>`;
}

function serveFeed(items: Item[]) {
  globalThis.fetch = vi
    .fn()
    .mockImplementation(async () => new Response(rss(items), { status: 200 }));
}

async function storedGuids(): Promise<string[]> {
  return unwrap(await getAllArticles()).map((a) => a.guid).sort();
}

async function addedFeed(): Promise<Feed> {
  const feed = unwrap(createFeed({ url: FEED_URL, title: "Slow" }));
  await addFeed(feed);
  return feed;
}

/** Purge as if `days` had passed, which is how an undated item ages. */
async function purgeAfter(days: number) {
  unwrap(await purgeExpiredArticles({ now: Date.now() + days * DAY }));
}

describe("retention at ingest", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    unwrap(await open("refresh retention test"));
    await putPreferences({ ...DEFAULT_PREFERENCES, articleRetention: 30 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  it("refresh skips feed items published before the retention period", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "fresh", ageDays: 2 }, { guid: "old", ageDays: 45 }]);

    unwrap(await refreshFeed(feed));

    expect(await storedGuids()).toEqual(["fresh"]);
  });

  it("subscribing skips feed items published before the retention period", async () => {
    serveFeed([{ guid: "fresh", ageDays: 2 }, { guid: "old", ageDays: 45 }]);

    unwrap(await addFeedFlow(FEED_URL));

    expect(await storedGuids()).toEqual(["fresh"]);
  });

  it("a purged undated item does not come back while it stays in the feed", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "undated" }]);
    unwrap(await refreshFeed(feed));
    await purgeAfter(31);
    expect(await storedGuids()).toEqual([]);

    unwrap(await refreshFeed(unwrap(await getFeed(feed.id))));

    expect(await storedGuids()).toEqual([]);
  });

  it("a new undated item is still added", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "undated-new" }]);

    unwrap(await refreshFeed(feed));

    expect(await storedGuids()).toEqual(["undated-new"]);
  });

  it("reloading a feed skips items published before the retention period", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "fresh", ageDays: 2 }, { guid: "old", ageDays: 45 }]);

    unwrap(await reloadFeed(feed));

    expect(await storedGuids()).toEqual(["fresh"]);
  });

  it("reloading a feed keeps a purged undated item gone", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "undated" }]);
    unwrap(await reloadFeed(feed));
    await purgeAfter(31);

    unwrap(await reloadFeed(unwrap(await getFeed(feed.id))));

    expect(await storedGuids()).toEqual([]);
  });

  it("forgets a retired guid once the item leaves the feed, so the list stays bounded", async () => {
    const feed = await addedFeed();
    serveFeed([{ guid: "undated" }]);
    unwrap(await refreshFeed(feed));
    await purgeAfter(31);

    serveFeed([{ guid: "another", ageDays: 1 }]);
    unwrap(await refreshFeed(unwrap(await getFeed(feed.id))));

    expect(unwrap(await getFeed(feed.id)).retiredGuids ?? []).toEqual([]);
  });
});
