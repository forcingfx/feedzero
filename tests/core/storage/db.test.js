import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  openWithKeys,
  close,
  getSalt,
  addFeed,
  getFeeds,
  getFeed,
  feedExistsByUrl,
  removeFeed,
  addArticles,
  getArticles,
  getAllArticles,
  updateArticle,
  getArticleByGuid,
  exportAll,
  importAll,
  addFolder,
  getFolders,
  updateFolder,
  removeFolder,
  updateFeed,
} from "../../../src/core/storage/db.ts";
import { createFeed, createArticle } from "../../../src/core/storage/schema.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

describe("Database", () => {
  beforeEach(async () => {
    const result = await open("test-passphrase");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  describe("feeds", () => {
    it("should add and retrieve a feed", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      const addResult = await addFeed(feed);
      expect(isOk(addResult)).toBe(true);

      const getResult = await getFeeds();
      expect(isOk(getResult)).toBe(true);
      const feeds = unwrap(getResult);
      expect(feeds).toHaveLength(1);
      expect(feeds[0].url).toBe("https://example.com/rss");
      expect(feeds[0].title).toBe("Example");
    });

    it("should get a single feed by id", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);

      const result = await getFeed(feed.id);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).title).toBe("Example");
    });

    it("should return err for non-existent feed", async () => {
      const result = await getFeed("non-existent");
      expect(isErr(result)).toBe(true);
    });

    it("should remove a feed and its articles", async () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://x.com/1",
        }),
      );
      await addArticles([article]);

      await removeFeed(feed.id);

      const feedsResult = await getFeeds();
      expect(unwrap(feedsResult)).toHaveLength(0);

      const articlesResult = await getArticles(feed.id);
      expect(unwrap(articlesResult)).toHaveLength(0);
    });
  });

  describe("articles", () => {
    it("should add and retrieve articles for a feed", async () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      await addFeed(feed);

      const a1 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 1",
          link: "https://x.com/1",
          publishedAt: 1000,
        }),
      );
      const a2 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 2",
          link: "https://x.com/2",
          publishedAt: 2000,
        }),
      );
      await addArticles([a1, a2]);

      const result = await getArticles(feed.id);
      expect(isOk(result)).toBe(true);
      const articles = unwrap(result);
      expect(articles).toHaveLength(2);
      // Sorted by publishedAt descending
      expect(articles[0].title).toBe("Post 2");
      expect(articles[1].title).toBe("Post 1");
    });

    it("should update an article", async () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://x.com/1",
        }),
      );
      await addArticles([article]);

      article.read = true;
      await updateArticle(article);

      const articles = unwrap(await getArticles(feed.id));
      expect(articles[0].read).toBe(true);
    });
  });

  describe("duplicate detection", () => {
    it("should detect existing feed by URL using the index", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);

      const exists = await feedExistsByUrl("https://example.com/rss");
      expect(isOk(exists)).toBe(true);
      expect(unwrap(exists)).toBe(true);
    });

    it("should return false for non-existent URL", async () => {
      const exists = await feedExistsByUrl("https://example.com/nope");
      expect(isOk(exists)).toBe(true);
      expect(unwrap(exists)).toBe(false);
    });

    it("should not throw ConstraintError when adding duplicate URL", async () => {
      const feed1 = unwrap(
        createFeed({ url: "https://example.com/rss", title: "First" }),
      );
      await addFeed(feed1);

      // Adding a second feed with the same URL should return an error, not throw
      const feed2 = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Second" }),
      );
      const result = await addFeed(feed2);
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/already exists/i);
    });
  });

  describe("persistence across sessions", () => {
    it("should decrypt data after close and reopen with same passphrase", async () => {
      // Session 1: add a feed
      const feed = unwrap(
        createFeed({
          url: "https://example.com/rss",
          title: "Persistent Feed",
        }),
      );
      await addFeed(feed);

      // Close (simulates ending a session)
      close();

      // Session 2: reopen with same passphrase
      const reopenResult = await open("test-passphrase");
      expect(isOk(reopenResult)).toBe(true);

      // Data should still be readable
      const feedsResult = await getFeeds();
      expect(isOk(feedsResult)).toBe(true);
      const feeds = unwrap(feedsResult);
      expect(feeds).toHaveLength(1);
      expect(feeds[0].title).toBe("Persistent Feed");
      expect(feeds[0].url).toBe("https://example.com/rss");
    });

    it("should fail to decrypt data with a different passphrase", async () => {
      // Session 1: add a feed
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Secret Feed" }),
      );
      await addFeed(feed);

      // Close
      close();

      // Session 2: reopen with different passphrase
      const reopenResult = await open("wrong-passphrase");
      expect(isOk(reopenResult)).toBe(true);

      // Data should not be readable - returns error when all records fail to decrypt
      const feedsResult = await getFeeds();
      expect(isErr(feedsResult)).toBe(true);
      expect(feedsResult.error).toMatch(/incorrect passphrase/i);
    });
  });

  describe("encryption", () => {
    function readRawRecords(table) {
      return new Promise((resolve) => {
        const tx = indexedDB.open("feedzero");
        tx.onsuccess = () => {
          const rawDb = tx.result;
          const rtx = rawDb.transaction(table, "readonly");
          const req = rtx.objectStore(table).getAll();
          req.onsuccess = () => {
            rawDb.close();
            resolve(req.result);
          };
        };
      });
    }

    it("should store data encrypted (raw values are not plaintext)", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Secret Feed" }),
      );
      await addFeed(feed);

      const rawData = await readRawRecords("feeds");

      expect(rawData).toHaveLength(1);
      expect(rawData[0].iv).toBeDefined();
      expect(rawData[0].ciphertext).toBeDefined();
      expect(rawData[0].title).toBeUndefined();
      expect(rawData[0].description).toBeUndefined();
    });

    it("should store feed url as HMAC hash, not plaintext", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Feed" }),
      );
      await addFeed(feed);

      const rawData = await readRawRecords("feeds");

      expect(rawData).toHaveLength(1);
      expect(rawData[0].url).not.toBe("https://example.com/rss");
      expect(rawData[0].url).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should store article guid as HMAC hash, not plaintext", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Feed" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
          guid: "unique-guid-123",
        }),
      );
      await addArticles([article]);

      const rawData = await readRawRecords("articles");

      expect(rawData).toHaveLength(1);
      expect(rawData[0].guid).not.toBe("unique-guid-123");
      expect(rawData[0].guid).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should store article feedId as HMAC hash, not plaintext", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Feed" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
        }),
      );
      await addArticles([article]);

      const rawData = await readRawRecords("articles");

      expect(rawData).toHaveLength(1);
      expect(rawData[0].feedId).not.toBe(feed.id);
      expect(rawData[0].feedId).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should not store publishedAt as a plaintext index field on articles", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Feed" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
          publishedAt: 1700000000000,
        }),
      );
      await addArticles([article]);

      const rawData = await readRawRecords("articles");

      expect(rawData).toHaveLength(1);
      expect(rawData[0].publishedAt).toBeUndefined();
    });
  });

  describe("getArticleByGuid", () => {
    it("should find an article by feedId and guid", async () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://x.com/1",
          guid: "guid-123",
        }),
      );
      await addArticles([article]);

      const result = await getArticleByGuid(feed.id, "guid-123");
      expect(isOk(result)).toBe(true);
      expect(result.value).not.toBeNull();
      expect(result.value.title).toBe("Post");
    });

    it("should return null for non-existent guid", async () => {
      const feed = unwrap(createFeed({ url: "https://x.com/rss", title: "X" }));
      await addFeed(feed);

      const result = await getArticleByGuid(feed.id, "no-such-guid");
      expect(isOk(result)).toBe(true);
      expect(result.value).toBeNull();
    });

    it("should not match guid from a different feed", async () => {
      const feed1 = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      const feed2 = unwrap(
        createFeed({ url: "https://b.com/rss", title: "B" }),
      );
      await addFeed(feed1);
      await addFeed(feed2);
      const article = unwrap(
        createArticle({
          feedId: feed1.id,
          title: "Post",
          link: "https://a.com/1",
          guid: "shared-guid",
        }),
      );
      await addArticles([article]);

      const result = await getArticleByGuid(feed2.id, "shared-guid");
      expect(isOk(result)).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe("exportAll / importAll", () => {
    it("should export all feeds and articles", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://example.com/1",
        }),
      );
      await addArticles([article]);

      const result = await exportAll();
      expect(isOk(result)).toBe(true);
      const data = unwrap(result);
      expect(data.feeds).toHaveLength(1);
      expect(data.feeds[0].title).toBe("Example");
      expect(data.articles).toHaveLength(1);
      expect(data.articles[0].title).toBe("Post");
    });

    it("should export empty arrays when database is empty", async () => {
      const result = await exportAll();
      expect(isOk(result)).toBe(true);
      const data = unwrap(result);
      expect(data.feeds).toEqual([]);
      expect(data.articles).toEqual([]);
    });

    it("should import feeds and articles, replacing existing data", async () => {
      // Add some existing data
      const oldFeed = unwrap(
        createFeed({ url: "https://old.com/rss", title: "Old" }),
      );
      await addFeed(oldFeed);

      // Import new data
      const newFeed = unwrap(
        createFeed({ url: "https://new.com/rss", title: "New" }),
      );
      const newArticle = unwrap(
        createArticle({
          feedId: newFeed.id,
          title: "New Post",
          link: "https://new.com/1",
        }),
      );

      const importResult = await importAll({
        feeds: [newFeed],
        articles: [newArticle],
      });
      expect(isOk(importResult)).toBe(true);

      // Old data should be gone
      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(1);
      expect(feeds[0].title).toBe("New");

      const articles = unwrap(await getArticles(newFeed.id));
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe("New Post");
    });

    it("should round-trip: export then import preserves data", async () => {
      const feed = unwrap(
        createFeed({ url: "https://rt.com/rss", title: "RoundTrip" }),
      );
      await addFeed(feed);
      const a1 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 1",
          link: "https://rt.com/1",
        }),
      );
      const a2 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 2",
          link: "https://rt.com/2",
        }),
      );
      await addArticles([a1, a2]);

      // Export
      const exported = unwrap(await exportAll());

      // Clear and reimport
      const importResult = await importAll({
        feeds: exported.feeds,
        articles: exported.articles,
      });
      expect(isOk(importResult)).toBe(true);

      // Verify data matches
      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(1);
      expect(feeds[0].url).toBe("https://rt.com/rss");

      const articles = unwrap(await getArticles(feed.id));
      expect(articles).toHaveLength(2);
    });
  });

  describe("getAllArticles", () => {
    it("should return all articles from all feeds sorted by publishedAt desc", async () => {
      const feed1 = unwrap(
        createFeed({ url: "https://a.com/rss", title: "Feed A" }),
      );
      const feed2 = unwrap(
        createFeed({ url: "https://b.com/rss", title: "Feed B" }),
      );
      await addFeed(feed1);
      await addFeed(feed2);

      const a1 = unwrap(
        createArticle({
          feedId: feed1.id,
          title: "A Post 1",
          link: "https://a.com/1",
          publishedAt: 1000,
        }),
      );
      const a2 = unwrap(
        createArticle({
          feedId: feed2.id,
          title: "B Post 1",
          link: "https://b.com/1",
          publishedAt: 3000,
        }),
      );
      const a3 = unwrap(
        createArticle({
          feedId: feed1.id,
          title: "A Post 2",
          link: "https://a.com/2",
          publishedAt: 2000,
        }),
      );
      await addArticles([a1, a2, a3]);

      const result = await getAllArticles();
      expect(isOk(result)).toBe(true);
      const articles = unwrap(result);
      expect(articles).toHaveLength(3);
      // Sorted by publishedAt descending
      expect(articles[0].title).toBe("B Post 1"); // 3000
      expect(articles[1].title).toBe("A Post 2"); // 2000
      expect(articles[2].title).toBe("A Post 1"); // 1000
    });

    it("should return empty array when no articles exist", async () => {
      const result = await getAllArticles();
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual([]);
    });
  });

  describe("getSalt", () => {
    it("should return the salt stored during open()", async () => {
      const result = await getSalt();
      expect(isOk(result)).toBe(true);
      const salt = unwrap(result);
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it("should return error when database is not open", async () => {
      close();
      const result = await getSalt();
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/not open/i);
    });

    it("should return the same salt across calls", async () => {
      const salt1 = unwrap(await getSalt());
      const salt2 = unwrap(await getSalt());
      expect(salt1).toEqual(salt2);
    });
  });

  describe("salt consistency: keys derived from getSalt() can decrypt data", () => {
    it("should decrypt data when reopened with keys derived from the DB salt", async () => {
      // Session 1: add data via passphrase-based open (already open from beforeEach)
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Salt Test" }),
      );
      await addFeed(feed);

      // Read the salt from the open database
      const salt = unwrap(await getSalt());

      // Derive extractable keys using the SAME salt
      const { deriveKey, deriveHmacKey, exportCryptoKey } =
        await import("../../../src/core/storage/crypto.ts");
      const dbKey = unwrap(
        await deriveKey("test-passphrase", salt, { extractable: true }),
      );
      const hmac = unwrap(
        await deriveHmacKey("test-passphrase", { extractable: true }),
      );
      const dbKeyJwk = await exportCryptoKey(dbKey);
      const hmacKeyJwk = await exportCryptoKey(hmac);

      // Close and reopen with the derived keys
      close();
      const result = await openWithKeys(dbKeyJwk, hmacKeyJwk);
      expect(isOk(result)).toBe(true);

      // Data should be readable
      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(1);
      expect(feeds[0].title).toBe("Salt Test");
    });
  });

  describe("openWithKeys", () => {
    it("should open database using pre-derived keys and read data written by passphrase open", async () => {
      // Session 1: add data via passphrase-based open (already open from beforeEach)
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Key Test" }),
      );
      await addFeed(feed);

      // Export the keys for the next session
      const { deriveKey, deriveHmacKey, exportCryptoKey } =
        await import("../../../src/core/storage/crypto.ts");

      // We need to derive extractable keys from the same passphrase
      // First get the salt from the meta store (it's stored during open)
      close();

      // Re-derive keys with extractable=true to export them
      // We need to open the DB briefly to get the stored salt
      const Dexie = (await import("dexie")).default;
      const tempDb = new Dexie("feedzero");
      tempDb.version(3).stores({
        feeds: "id, &url",
        articles: "id, feedId, [feedId+guid]",
        meta: "key",
      });
      await tempDb.open();
      const saltRecord = await tempDb.table("meta").get("salt");
      const salt = new Uint8Array(saltRecord.value);
      tempDb.close();

      const dbKey = unwrap(
        await deriveKey("test-passphrase", salt, { extractable: true }),
      );
      const hmac = unwrap(
        await deriveHmacKey("test-passphrase", { extractable: true }),
      );
      const dbKeyJwk = await exportCryptoKey(dbKey);
      const hmacKeyJwk = await exportCryptoKey(hmac);

      // Session 2: open with pre-derived keys
      const result = await openWithKeys(dbKeyJwk, hmacKeyJwk);
      expect(isOk(result)).toBe(true);

      // Should read data written in session 1
      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(1);
      expect(feeds[0].title).toBe("Key Test");
    });
  });

  describe("folder operations", () => {
    it("should add and retrieve folders", async () => {
      const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
      const addResult = await addFolder(folder);
      expect(isOk(addResult)).toBe(true);

      const foldersResult = await getFolders();
      expect(isOk(foldersResult)).toBe(true);
      const folders = unwrap(foldersResult);
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe("Tech");
    });

    it("should update a folder", async () => {
      const folder = { id: "folder-2", name: "Old Name", createdAt: Date.now() };
      await addFolder(folder);

      const updated = { ...folder, name: "New Name" };
      await updateFolder(updated);

      const folders = unwrap(await getFolders());
      const found = folders.find((f) => f.id === "folder-2");
      expect(found.name).toBe("New Name");
    });

    it("should remove a folder", async () => {
      const folder = { id: "folder-3", name: "ToDelete", createdAt: Date.now() };
      await addFolder(folder);

      await removeFolder("folder-3");

      const folders = unwrap(await getFolders());
      expect(folders.find((f) => f.id === "folder-3")).toBeUndefined();
    });
  });

  describe("updateFeed", () => {
    it("should update feed title", async () => {
      const feedResult = createFeed({
        url: "https://update-test.com/feed",
        title: "Original",
      });
      const feed = unwrap(feedResult);
      await addFeed(feed);

      await updateFeed({ ...feed, title: "Renamed" });

      const retrieved = unwrap(await getFeed(feed.id));
      expect(retrieved.title).toBe("Renamed");
    });

    it("should update feed folderId", async () => {
      const feedResult = createFeed({
        url: "https://folder-test.com/feed",
        title: "Test",
      });
      const feed = unwrap(feedResult);
      await addFeed(feed);

      await updateFeed({ ...feed, folderId: "folder-1" });

      const retrieved = unwrap(await getFeed(feed.id));
      expect(retrieved.folderId).toBe("folder-1");
    });
  });
});
