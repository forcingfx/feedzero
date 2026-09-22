/**
 * Integration tests for the star toggle ↔ offline copy boundary.
 *
 * Unstarring is now the user's lever for releasing saved offline full
 * text, which is what makes a large vault large. That only works if the
 * release actually reaches IndexedDB, so these tests run the store
 * mutator against the real `db.ts` over fake-indexeddb and read the row
 * back. Nothing in the storage layer is mocked.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import {
  open,
  close,
  deleteDatabase,
  addFeed,
  addArticles,
  getAllArticles,
  updateFeed,
} from "../../src/core/storage/db.ts";
import { createFeed, createArticle } from "../../src/core/storage/schema.ts";
import { unwrap } from "@feedzero/core/utils/result";
import type { Article, Feed } from "@feedzero/core/types";

const PASSPHRASE = "offline copy integration test";

async function seed(feed: Feed, article: Article): Promise<void> {
  await addFeed(feed);
  await addArticles([article]);
  await useFeedStore.getState().loadFeeds();
  await useArticleStore.getState().loadArticles(feed.id);
}

function starredWithOfflineCopy(feedId: string): Article {
  return {
    ...unwrap(
      createArticle({
        feedId,
        title: "Saved offline",
        link: "https://example.com/saved",
      }),
    ),
    starred: true,
    starredAt: Date.now(),
    extractedContent: "<p>the full text</p>",
    extractedAt: Date.now(),
  };
}

async function storedArticle(): Promise<Article> {
  const [article] = unwrap(await getAllArticles());
  return article;
}

beforeEach(async () => {
  const result = await open(PASSPHRASE);
  if (!result.ok) throw new Error(result.error);
});

afterEach(async () => {
  close();
  await deleteDatabase();
});

describe("unstarring releases the offline copy", () => {
  it("clears the saved full text when the article is unstarred", async () => {
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Example" }),
    );
    const article = starredWithOfflineCopy(feed.id);
    await seed(feed, article);

    await useArticleStore.getState().toggleStar(article.id);

    const stored = await storedArticle();
    expect(stored.starred).toBe(false);
    expect(stored.extractedContent).toBeUndefined();
    expect(stored.extractedAt).toBeUndefined();
  });

  it("keeps the copy when the feed is set to prefetch", async () => {
    // The user asked this feed to keep article bodies offline, so the
    // star is not what is holding the copy and unstarring must not take
    // it away — the next refresh would re-download it anyway.
    const feed = {
      ...unwrap(createFeed({ url: "https://kept.example/rss", title: "Kept" })),
      prefetchEnabled: true,
    };
    const article = starredWithOfflineCopy(feed.id);
    await seed(feed, article);
    await updateFeed(feed);
    await useFeedStore.getState().loadFeeds();

    await useArticleStore.getState().toggleStar(article.id);

    const stored = await storedArticle();
    expect(stored.starred).toBe(false);
    expect(stored.extractedContent).toBe("<p>the full text</p>");
  });

  it("leaves the article itself and its read state alone", async () => {
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Example" }),
    );
    const article = { ...starredWithOfflineCopy(feed.id), read: true };
    await seed(feed, article);

    await useArticleStore.getState().toggleStar(article.id);

    const stored = await storedArticle();
    expect(stored.title).toBe("Saved offline");
    expect(stored.read).toBe(true);
  });

  it("does not touch the copy when starring", async () => {
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Example" }),
    );
    const article = { ...starredWithOfflineCopy(feed.id), starred: false };
    await seed(feed, article);

    await useArticleStore.getState().toggleStar(article.id);

    const stored = await storedArticle();
    expect(stored.starred).toBe(true);
    expect(stored.extractedContent).toBe("<p>the full text</p>");
  });
});

describe("releaseOfflineCopies", () => {
  it("clears unmaintained copies and refreshes what the reader shows", async () => {
    // The in-memory article is what the reader renders. Leaving the text
    // there after clearing it on disk would show content that no longer
    // exists until the next reload.
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Example" }),
    );
    const article = { ...starredWithOfflineCopy(feed.id), starred: false };
    await seed(feed, article);
    useArticleStore.setState({ selectedArticle: article });

    const cleared = unwrap(await useArticleStore.getState().releaseOfflineCopies());

    expect(cleared).toBe(1);
    expect((await storedArticle()).extractedContent).toBeUndefined();
    expect(
      useArticleStore.getState().selectedArticle?.extractedContent,
    ).toBeUndefined();
    expect(
      useArticleStore
        .getState()
        .articlesByFeedId[feed.id]?.[0]?.extractedContent,
    ).toBeUndefined();
  });

  it("reports nothing released when every copy is still maintained", async () => {
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Example" }),
    );
    await seed(feed, starredWithOfflineCopy(feed.id));

    const cleared = unwrap(await useArticleStore.getState().releaseOfflineCopies());

    expect(cleared).toBe(0);
    expect((await storedArticle()).extractedContent).toBe("<p>the full text</p>");
  });
});
