import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  addFeed,
  addArticles,
  getAllArticles,
  putPreferences,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap } from "@feedzero/core/utils/result";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import type { Article, ArticleRetention, Feed } from "@feedzero/core/types";
import {
  countExpiredArticles,
  purgeExpiredArticles,
} from "@/core/storage/article-retention";

/**
 * Article retention keeps a vault from growing without bound: articles
 * published longer ago than the user's retention period are deleted,
 * unless the user starred them. Unread articles go too; a neglected
 * feed would otherwise grow the vault forever.
 *
 * Runs against the real encrypted db (fake-indexeddb), so a passing
 * test means rows are actually gone, not that a mock was called.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4);

let feed: Feed;

beforeEach(async () => {
  const result = await open("article retention test");
  if (!result.ok) throw new Error(result.error);
  feed = unwrap(createFeed({ url: "https://news.example/rss", title: "News" }));
  await addFeed(feed);
});

afterEach(() => {
  close();
  indexedDB.deleteDatabase("feedzero");
});

function articleAged(days: number, overrides: Partial<Article> = {}): Article {
  return {
    ...unwrap(
      createArticle({
        feedId: feed.id,
        title: `${days} days old`,
        link: `https://news.example/${days}-${Math.random()}`,
        publishedAt: NOW - days * DAY,
      }),
    ),
    ...overrides,
  };
}

async function setRetention(articleRetention: ArticleRetention) {
  await putPreferences({ ...DEFAULT_PREFERENCES, articleRetention });
}

async function remainingTitles(): Promise<string[]> {
  return unwrap(await getAllArticles()).map((a) => a.title).sort();
}

describe("purgeExpiredArticles", () => {
  it("deletes articles published before the retention period, read or not", async () => {
    await setRetention(30);
    await addArticles([
      articleAged(31),
      articleAged(45, { read: true }),
      articleAged(29),
    ]);

    const purged = unwrap(await purgeExpiredArticles({ now: NOW }));

    expect(purged.articlesRemoved).toBe(2);
    expect(await remainingTitles()).toEqual(["29 days old"]);
  });

  it("keeps starred articles however old", async () => {
    await setRetention(7);
    await addArticles([articleAged(400, { starred: true, starredAt: NOW })]);

    unwrap(await purgeExpiredArticles({ now: NOW }));

    expect(await remainingTitles()).toEqual(["400 days old"]);
  });

  it("removes nothing when retention is never", async () => {
    await setRetention("never");
    await addArticles([articleAged(1000)]);

    const purged = unwrap(await purgeExpiredArticles({ now: NOW }));

    expect(purged.articlesRemoved).toBe(0);
    expect(await remainingTitles()).toEqual(["1000 days old"]);
  });

  it("applies the 30-day default to a vault that never chose a period", async () => {
    // Owner's call: existing vaults are purged at the default on upgrade,
    // silently, rather than grandfathered to "never".
    const { articleRetention: _unset, ...legacyPrefs } = DEFAULT_PREFERENCES;
    void _unset;
    await putPreferences(legacyPrefs);
    await addArticles([articleAged(31), articleAged(29)]);

    unwrap(await purgeExpiredArticles({ now: NOW }));

    expect(await remainingTitles()).toEqual(["29 days old"]);
  });

  it("spares the article the user has open, so reading is never interrupted", async () => {
    await setRetention(30);
    const open = articleAged(60);
    await addArticles([open, articleAged(61)]);

    unwrap(await purgeExpiredArticles({ now: NOW, keep: new Set([open.id]) }));

    expect(await remainingTitles()).toEqual(["60 days old"]);
  });
});

describe("countExpiredArticles", () => {
  it("counts what a period would remove without deleting anything", async () => {
    await setRetention(90);
    await addArticles([articleAged(10), articleAged(20), articleAged(100)]);

    const count = unwrap(await countExpiredArticles(14, NOW));

    expect(count).toBe(2);
    expect((await remainingTitles()).length).toBe(3);
  });
});
