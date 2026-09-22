import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  addFeed,
  addArticles,
  getAllArticles,
  updateFeed,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap } from "@feedzero/core/utils/result";
import type { Article, Feed } from "@feedzero/core/types";
import {
  keepsOfflineCopy,
  withoutOfflineCopy,
  releaseUnmaintainedOfflineContent,
} from "@/core/storage/release-offline-content";

/**
 * Releasing offline full text is the remedy the sync size error has
 * been promising and unable to deliver. The rule it encodes: the app
 * keeps an offline copy for as long as it would re-fetch one, and not a
 * moment longer.
 *
 * That distinction is what makes the space stay freed. Clearing a
 * starred article's copy would only last until the next refresh, when
 * the prefetch service downloads it again.
 */

const PASSPHRASE = "release offline content test";

let feed: Feed;
let prefetchFeed: Feed;

beforeEach(async () => {
  const result = await open(PASSPHRASE);
  if (!result.ok) throw new Error(result.error);

  feed = unwrap(createFeed({ url: "https://plain.example/rss", title: "Plain" }));
  await addFeed(feed);

  prefetchFeed = unwrap(
    createFeed({ url: "https://kept.example/rss", title: "Kept" }),
  );
  await addFeed(prefetchFeed);
  await updateFeed({ ...prefetchFeed, prefetchEnabled: true });
});

afterEach(() => {
  close();
  indexedDB.deleteDatabase("feedzero");
});

function articleWithOfflineCopy(
  feedId: string,
  overrides: Partial<Article> = {},
): Article {
  return {
    ...unwrap(
      createArticle({
        feedId,
        title: "Saved",
        link: `https://example.com/${Math.random()}`,
      }),
    ),
    extractedContent: "<p>full text</p>",
    extractedAt: Date.now(),
    ...overrides,
  };
}

describe("keepsOfflineCopy", () => {
  const feeds = () =>
    new Map([
      ["plain", { ...feed, id: "plain", prefetchEnabled: false }],
      ["kept", { ...prefetchFeed, id: "kept", prefetchEnabled: true }],
    ]);

  it("keeps a starred article's copy", () => {
    const article = articleWithOfflineCopy("plain", { starred: true });
    expect(keepsOfflineCopy(article, feeds())).toBe(true);
  });

  it("keeps a copy in a feed set to prefetch", () => {
    const article = articleWithOfflineCopy("kept", { starred: false });
    expect(keepsOfflineCopy(article, feeds())).toBe(true);
  });

  it("does not keep a copy nothing would re-fetch", () => {
    const article = articleWithOfflineCopy("plain", { starred: false });
    expect(keepsOfflineCopy(article, feeds())).toBe(false);
  });
});

describe("withoutOfflineCopy", () => {
  it("drops both the text and its timestamp", () => {
    // Leaving `extractedAt` behind would claim a copy that is gone, and
    // the freshness checks read it.
    const stripped = withoutOfflineCopy(articleWithOfflineCopy("plain"));
    expect(stripped.extractedContent).toBeUndefined();
    expect(stripped.extractedAt).toBeUndefined();
  });

  it("leaves everything the user owns alone", () => {
    const article = articleWithOfflineCopy("plain", {
      read: true,
      starred: true,
      starredAt: 123,
    });
    const stripped = withoutOfflineCopy(article);
    expect(stripped.read).toBe(true);
    expect(stripped.starred).toBe(true);
    expect(stripped.starredAt).toBe(123);
    expect(stripped.title).toBe(article.title);
  });
});

describe("releaseUnmaintainedOfflineContent", () => {
  it("clears the copies nothing would re-fetch, and only those", async () => {
    await addArticles([
      articleWithOfflineCopy(feed.id, { starred: false }),
      articleWithOfflineCopy(feed.id, { starred: false }),
      articleWithOfflineCopy(feed.id, { starred: true }),
      articleWithOfflineCopy(prefetchFeed.id, { starred: false }),
    ]);

    const released = unwrap(await releaseUnmaintainedOfflineContent());
    expect(released.articlesCleared).toBe(2);

    const remaining = unwrap(await getAllArticles()).filter(
      (a) => a.extractedContent,
    );
    expect(remaining).toHaveLength(2);
  });

  it("is a no-op when there is nothing to release", async () => {
    await addArticles([articleWithOfflineCopy(feed.id, { starred: true })]);

    const released = unwrap(await releaseUnmaintainedOfflineContent());
    expect(released.articlesCleared).toBe(0);
  });

  it("leaves the article and its read state in place", async () => {
    await addArticles([
      articleWithOfflineCopy(feed.id, { starred: false, read: true }),
    ]);

    unwrap(await releaseUnmaintainedOfflineContent());

    const [article] = unwrap(await getAllArticles());
    expect(article).toBeDefined();
    expect(article.read).toBe(true);
    expect(article.extractedContent).toBeUndefined();
  });
});
