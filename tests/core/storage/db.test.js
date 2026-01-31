import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  addFeed,
  getFeeds,
  getFeed,
  removeFeed,
  addArticles,
  getArticles,
  updateArticle,
} from "../../../src/core/storage/db.js";
import { createFeed, createArticle } from "../../../src/core/storage/schema.js";
import { isOk, isErr, unwrap } from "../../../src/utils/result.js";

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

  describe("encryption", () => {
    it("should store data encrypted (raw values are not plaintext)", async () => {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Secret Feed" }),
      );
      await addFeed(feed);

      // Access raw IndexedDB to verify encryption
      const rawData = await new Promise((resolve) => {
        const tx = indexedDB.open("feedzero");
        tx.onsuccess = () => {
          const db = tx.result;
          const rtx = db.transaction("feeds", "readonly");
          const req = rtx.objectStore("feeds").getAll();
          req.onsuccess = () => resolve(req.result);
        };
      });

      expect(rawData).toHaveLength(1);
      // Raw record should have iv and ciphertext, not plaintext content fields
      expect(rawData[0].iv).toBeDefined();
      expect(rawData[0].ciphertext).toBeDefined();
      expect(rawData[0].title).toBeUndefined();
      expect(rawData[0].description).toBeUndefined();
    });
  });
});
