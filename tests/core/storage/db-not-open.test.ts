import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  close,
  feedExistsByUrl,
  addFeed,
  updateFeed,
  getFeeds,
  getFeed,
  removeFeedsByUrl,
  removeArticlesByFeedId,
  removeFeed,
  addArticles,
  getArticles,
  getAllArticles,
  updateArticle,
  updateArticles,
  getArticleByGuid,
  exportAll,
  importAll,
  addFolder,
  getFolders,
  updateFolder,
  removeFolder,
  exportCurrentKeys,
  getSalt,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { isErr, unwrap } from "@feedzero/core/utils/result";
import type { Feed, Article, Folder } from "@feedzero/core/types";

/**
 * Characterisation tests for the "database not open" error path.
 *
 * Most public functions in db.ts call requireOpen() which throws when
 * db/cryptoKey/hmacKey are null. Each function's outer try/catch converts
 * that throw into an err Result with a function-specific prefix.
 *
 * These tests exercise that path by calling each function with no open DB
 * and asserting the returned Result is err.
 */
describe("db functions return err when DB is not open", () => {
  // Build valid-shape inputs once. These never reach the DB because the
  // requireOpen() check throws before encryption is attempted.
  const sampleFeed: Feed = unwrap(
    createFeed({ url: "https://example.com/rss", title: "Example" }),
  );
  const sampleArticle: Article = unwrap(
    createArticle({
      feedId: sampleFeed.id,
      title: "Post",
      link: "https://example.com/1",
    }),
  );
  const sampleFolder: Folder = {
    id: "folder-not-open",
    name: "Not Open",
    createdAt: Date.now(),
  };

  beforeEach(() => {
    // Ensure a clean closed state at the start of every test.
    close();
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  it("feedExistsByUrl returns err when DB not open", async () => {
    const result = await feedExistsByUrl("https://example.com/feed");
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to check feed existence/);
    }
  });

  it("addFeed returns err when DB not open", async () => {
    // addFeed calls feedExistsByUrl first; that returns err (not throw),
    // so addFeed falls through to putEncrypted which surfaces the
    // "Failed to store encrypted data" message from its own catch.
    const result = await addFeed(sampleFeed);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to store encrypted data/);
    }
  });

  it("updateFeed returns err when DB not open", async () => {
    const result = await updateFeed(sampleFeed);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to store encrypted data/);
    }
  });

  it("getFeeds returns err when DB not open", async () => {
    const result = await getFeeds();
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to read all encrypted data/);
    }
  });

  it("getFeed returns err when DB not open", async () => {
    const result = await getFeed(sampleFeed.id);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to read encrypted data/);
    }
  });

  it("removeFeedsByUrl returns err when DB not open", async () => {
    const result = await removeFeedsByUrl("https://example.com/rss");
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to remove feeds by URL/);
    }
  });

  it("removeArticlesByFeedId returns err when DB not open", async () => {
    const result = await removeArticlesByFeedId(sampleFeed.id);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to remove articles/);
    }
  });

  it("removeFeed returns err when DB not open", async () => {
    const result = await removeFeed(sampleFeed.id);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to remove feed/);
    }
  });

  it("addArticles returns err when DB not open", async () => {
    const result = await addArticles([sampleArticle]);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to add articles/);
    }
  });

  it("getArticles returns err when DB not open", async () => {
    const result = await getArticles(sampleFeed.id);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to get articles/);
    }
  });

  it("getAllArticles returns err when DB not open", async () => {
    const result = await getAllArticles();
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to get all articles/);
    }
  });

  it("updateArticle returns err when DB not open", async () => {
    const result = await updateArticle(sampleArticle);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to store encrypted data/);
    }
  });

  it("updateArticles returns err when DB not open", async () => {
    const result = await updateArticles([sampleArticle]);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to update articles/);
    }
  });

  it("getArticleByGuid returns err when DB not open", async () => {
    const result = await getArticleByGuid(sampleFeed.id, "guid-1");
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to find article by guid/);
    }
  });

  it("exportAll returns err when DB not open", async () => {
    // exportAll bubbles up the underlying getFeeds err (not its own catch).
    const result = await exportAll();
    expect(isErr(result)).toBe(true);
  });

  it("importAll returns err when DB not open", async () => {
    const result = await importAll({ feeds: [], articles: [] });
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to import data/);
    }
  });

  it("addFolder returns err when DB not open", async () => {
    const result = await addFolder(sampleFolder);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to store encrypted data/);
    }
  });

  it("getFolders returns err when DB not open", async () => {
    const result = await getFolders();
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to read all encrypted data/);
    }
  });

  it("updateFolder returns err when DB not open", async () => {
    const result = await updateFolder(sampleFolder);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to store encrypted data/);
    }
  });

  it("removeFolder returns err when DB not open", async () => {
    const result = await removeFolder(sampleFolder.id);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to remove folder/);
    }
  });

  it("exportCurrentKeys returns err when DB not open", async () => {
    const result = await exportCurrentKeys();
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to export keys/);
    }
  });

  it("getSalt returns err when DB not open", async () => {
    // getSalt has its own short-circuit before requireOpen().
    const result = await getSalt();
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toMatch(/Database not open/);
    }
  });
});
