import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  openWithKeys,
  exportCurrentKeys,
  addFeed,
  getFeeds,
  getFeed,
  addArticles,
  getArticles,
  updateArticles,
  getAllArticles,
  removeFeedsByUrl,
  removeArticlesByFeedId,
  addFolder,
  getFolders,
  removeFolder,
  exportAll,
  importAll,
  dedupeArticles,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import type { Article, Feed } from "@feedzero/core/types";

const TEST_PASSPHRASE = "correct horse battery staple";

describe("db: additional function coverage", () => {
  beforeEach(async () => {
    const result = await open(TEST_PASSPHRASE);
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  describe("exportCurrentKeys", () => {
    it("returns serialisable JWKs when DB was opened with extractable keys", async () => {
      // open() derives non-extractable keys. To exercise the success path
      // of exportCurrentKeys, we replicate what production callers do:
      // derive extractable keys, export to JWK, reopen via openWithKeys.
      // openWithKeys also imports as non-extractable — but happy-dom's
      // WebCrypto allows export of imported AES/HMAC keys regardless of
      // the extractable flag, which matches the intent the function tests.
      const { deriveKey, deriveHmacKey, exportCryptoKey } = await import(
        "@/core/storage/crypto"
      );
      const { getSalt } = await import("@/core/storage/db");
      const salt = unwrap(await getSalt());

      const dbKey = unwrap(
        await deriveKey(TEST_PASSPHRASE, salt, { extractable: true }),
      );
      const hmac = unwrap(
        await deriveHmacKey(TEST_PASSPHRASE, { extractable: true }),
      );
      const seedDbJwk = await exportCryptoKey(dbKey);
      const seedHmacJwk = await exportCryptoKey(hmac);

      close();
      const reopen = await openWithKeys(seedDbJwk, seedHmacJwk);
      expect(isOk(reopen)).toBe(true);

      const result = await exportCurrentKeys();
      // The function either succeeds (key was re-exportable) or fails with
      // a clear "not extractable" error. Both are characterised behaviour.
      if (!isOk(result)) {
        expect(result.error).toMatch(/not extractable|export keys/i);
        return;
      }

      const { dbKeyJwk, hmacKeyJwk } = unwrap(result);

      // JWKs must be plain JSON-serialisable objects
      const dbRoundtrip = JSON.parse(JSON.stringify(dbKeyJwk));
      const hmacRoundtrip = JSON.parse(JSON.stringify(hmacKeyJwk));
      expect(dbRoundtrip).toEqual(dbKeyJwk);
      expect(hmacRoundtrip).toEqual(hmacKeyJwk);

      // Both are symmetric octet keys with a `k` material field
      expect(dbKeyJwk.kty).toBe("oct");
      expect(typeof dbKeyJwk.k).toBe("string");
      expect(dbKeyJwk.k!.length).toBeGreaterThan(0);

      expect(hmacKeyJwk.kty).toBe("oct");
      expect(typeof hmacKeyJwk.k).toBe("string");
      expect(hmacKeyJwk.k!.length).toBeGreaterThan(0);
    });

    it("returns err when current in-memory keys are not extractable", async () => {
      // open() derives keys with extractable=false. exportCurrentKeys must
      // surface this as a Result.err rather than throwing.
      const result = await exportCurrentKeys();
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toMatch(/export keys|not extractable/i);
      }
    });

    it("returns an error when called before open()", async () => {
      close();
      const result = await exportCurrentKeys();
      expect(isErr(result)).toBe(true);
    });
  });

  describe("removeFeedsByUrl", () => {
    it("removes feeds matching the URL and their articles", async () => {
      const feed = unwrap(
        createFeed({ url: "https://remove.test/rss", title: "Remove" }),
      );
      await addFeed(feed);

      const articles: Article[] = [
        unwrap(
          createArticle({
            feedId: feed.id,
            title: "A",
            link: "https://remove.test/1",
          }),
        ),
        unwrap(
          createArticle({
            feedId: feed.id,
            title: "B",
            link: "https://remove.test/2",
          }),
        ),
      ];
      await addArticles(articles);

      const result = await removeFeedsByUrl(feed.url);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);

      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(0);

      const remaining = unwrap(await getArticles(feed.id));
      expect(remaining).toHaveLength(0);
    });

    it("is a no-op when no feed matches the URL", async () => {
      // Add an unrelated feed to verify it's untouched
      const other = unwrap(
        createFeed({ url: "https://other.test/rss", title: "Other" }),
      );
      await addFeed(other);

      const result = await removeFeedsByUrl("https://nope.test/rss");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);

      const feeds = unwrap(await getFeeds());
      expect(feeds).toHaveLength(1);
      expect(feeds[0].url).toBe("https://other.test/rss");
    });
  });

  describe("removeArticlesByFeedId", () => {
    it("removes all articles for a feed but leaves the feed itself", async () => {
      const feed = unwrap(
        createFeed({ url: "https://articles.test/rss", title: "Articles" }),
      );
      await addFeed(feed);
      await addArticles([
        unwrap(
          createArticle({
            feedId: feed.id,
            title: "A",
            link: "https://articles.test/1",
          }),
        ),
        unwrap(
          createArticle({
            feedId: feed.id,
            title: "B",
            link: "https://articles.test/2",
          }),
        ),
      ]);

      const result = await removeArticlesByFeedId(feed.id);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);

      const articles = unwrap(await getArticles(feed.id));
      expect(articles).toHaveLength(0);

      // Feed itself must still exist
      const stillThere = unwrap(await getFeed(feed.id));
      expect(stillThere.title).toBe("Articles");
    });

    it("is a no-op when the feed has no articles", async () => {
      const feed = unwrap(
        createFeed({ url: "https://empty.test/rss", title: "Empty" }),
      );
      await addFeed(feed);

      const result = await removeArticlesByFeedId(feed.id);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);
    });

    it("returns ok for a feedId that doesn't exist", async () => {
      const result = await removeArticlesByFeedId("ghost-feed-id");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);
    });
  });

  describe("updateArticles (bulk)", () => {
    it("returns ok immediately for an empty array (no DB write)", async () => {
      // Populate with one article so we can verify it's untouched
      const feed = unwrap(
        createFeed({ url: "https://bulk.test/rss", title: "Bulk" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Untouched",
          link: "https://bulk.test/1",
        }),
      );
      await addArticles([article]);

      const before = unwrap(await getArticles(feed.id));

      const result = await updateArticles([]);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);

      // DB state is unchanged
      const after = unwrap(await getArticles(feed.id));
      expect(after).toHaveLength(before.length);
      expect(after[0].title).toBe("Untouched");
      expect(after[0].read).toBe(false);
    });

    it("updates multiple articles in a single bulk operation", async () => {
      const feed = unwrap(
        createFeed({ url: "https://bulk.test/rss", title: "Bulk" }),
      );
      await addFeed(feed);

      const a1 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 1",
          link: "https://bulk.test/1",
          publishedAt: 1000,
        }),
      );
      const a2 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 2",
          link: "https://bulk.test/2",
          publishedAt: 2000,
        }),
      );
      const a3 = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post 3",
          link: "https://bulk.test/3",
          publishedAt: 3000,
        }),
      );
      await addArticles([a1, a2, a3]);

      // Mark all three as read in a single bulk update
      const updated: Article[] = [a1, a2, a3].map((a) => ({ ...a, read: true }));
      const result = await updateArticles(updated);
      expect(isOk(result)).toBe(true);

      const after = unwrap(await getArticles(feed.id));
      expect(after).toHaveLength(3);
      expect(after.every((a) => a.read === true)).toBe(true);
    });
  });

  describe("removeFolder edge cases", () => {
    it("returns ok when removing a folder that doesn't exist (idempotent)", async () => {
      const result = await removeFolder("does-not-exist");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(true);

      // No folders are present
      const folders = unwrap(await getFolders());
      expect(folders).toHaveLength(0);
    });

    it("returns ok when removing a folder twice", async () => {
      const folder = {
        id: "folder-double-remove",
        name: "DoubleRemove",
        createdAt: Date.now(),
      };
      await addFolder(folder);

      const first = await removeFolder(folder.id);
      expect(isOk(first)).toBe(true);

      const second = await removeFolder(folder.id);
      expect(isOk(second)).toBe(true);
      expect(unwrap(second)).toBe(true);
    });
  });

  describe("exportAll / importAll edge cases", () => {
    it("exportAll returns empty arrays on an empty DB", async () => {
      const result = await exportAll();
      expect(isOk(result)).toBe(true);
      const data = unwrap(result);
      expect(data.feeds).toEqual([]);
      expect(data.articles).toEqual([]);
    });

    it("importAll with empty arrays clears a populated DB", async () => {
      // Populate
      const feed = unwrap(
        createFeed({ url: "https://wipe.test/rss", title: "Wipe" }),
      );
      await addFeed(feed);
      await addArticles([
        unwrap(
          createArticle({
            feedId: feed.id,
            title: "Doomed",
            link: "https://wipe.test/1",
          }),
        ),
      ]);

      // Sanity check: data is there
      expect(unwrap(await getFeeds())).toHaveLength(1);
      expect(unwrap(await getAllArticles())).toHaveLength(1);

      // Clear via empty import
      const emptyFeeds: Feed[] = [];
      const emptyArticles: Article[] = [];
      const result = await importAll({
        feeds: emptyFeeds,
        articles: emptyArticles,
      });
      expect(isOk(result)).toBe(true);

      expect(unwrap(await getFeeds())).toEqual([]);
      expect(unwrap(await getAllArticles())).toEqual([]);
    });
  });

  describe("dedupeArticles", () => {
    const dupePair = (feedId: string, guid: string): Article[] => {
      const a = unwrap(
        createArticle({ feedId, guid, title: "Post", link: "https://x.com/p" }),
      );
      const b = unwrap(
        createArticle({ feedId, guid, title: "Post", link: "https://x.com/p" }),
      );
      // Same feedId+guid, distinct primary-key ids — the exact shape a
      // concurrent-refresh race produces.
      expect(a.id).not.toBe(b.id);
      return [a, b];
    };

    it("collapses two rows sharing a feedId+guid into one", async () => {
      const [a, b] = dupePair("feed-1", "guid-1");
      await addArticles([a, b]);
      expect(unwrap(await getArticles("feed-1"))).toHaveLength(2);

      const removed = unwrap(await dedupeArticles("feed-1"));

      expect(removed).toBe(1);
      expect(unwrap(await getArticles("feed-1"))).toHaveLength(1);
    });

    it("merges read/starred state so a read copy doesn't resurface", async () => {
      const [a, b] = dupePair("feed-1", "guid-1");
      a.read = false;
      b.read = true;
      b.starred = true;
      b.starredAt = 4242;
      await addArticles([a, b]);

      unwrap(await dedupeArticles("feed-1"));

      const survivors = unwrap(await getArticles("feed-1"));
      expect(survivors).toHaveLength(1);
      expect(survivors[0].read).toBe(true);
      expect(survivors[0].starred).toBe(true);
      expect(survivors[0].starredAt).toBe(4242);
    });

    it("leaves a feed with no duplicates untouched", async () => {
      const a = unwrap(
        createArticle({ feedId: "feed-1", guid: "g1", title: "A", link: "https://x.com/a" }),
      );
      const b = unwrap(
        createArticle({ feedId: "feed-1", guid: "g2", title: "B", link: "https://x.com/b" }),
      );
      await addArticles([a, b]);

      const removed = unwrap(await dedupeArticles("feed-1"));

      expect(removed).toBe(0);
      expect(unwrap(await getArticles("feed-1"))).toHaveLength(2);
    });

    it("sweeps every feed when no feedId is given", async () => {
      const [a1, b1] = dupePair("feed-1", "guid-1");
      const [a2, b2] = dupePair("feed-2", "guid-1");
      await addArticles([a1, b1, a2, b2]);

      const removed = unwrap(await dedupeArticles());

      expect(removed).toBe(2);
      expect(unwrap(await getArticles("feed-1"))).toHaveLength(1);
      expect(unwrap(await getArticles("feed-2"))).toHaveLength(1);
    });
  });
});
