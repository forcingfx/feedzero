import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import {
  open,
  close,
  addFeed,
  addArticles,
  getFeeds,
  getFeed,
  getArticleByGuid,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import { ok, err } from "@feedzero/core/utils/result";
import { DB_NAME, DB_VERSION } from "@feedzero/core/utils/constants";

/**
 * Mock the crypto module so individual tests can override `decrypt` to simulate
 * partial or per-call failures without corrupting on-disk records. The default
 * implementation is the real one — tests only override behavior when needed.
 */
vi.mock("@/core/storage/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/storage/crypto")>();
  return {
    ...actual,
    decrypt: vi.fn(actual.decrypt),
  };
});

import { decrypt } from "@/core/storage/crypto";

/**
 * Open the underlying Dexie DB directly so a test can write a malformed record
 * (e.g. missing iv/ciphertext) without going through the encrypted public API.
 */
async function openRawDexie(): Promise<Dexie> {
  const raw = new Dexie(DB_NAME);
  raw.version(DB_VERSION).stores({
    feeds: "id, &url",
    articles: "id, feedId, [feedId+guid]",
    folders: "id",
    meta: "key",
  });
  await raw.open();
  return raw;
}

describe("db decrypt edge cases", () => {
  beforeEach(async () => {
    // Reset decrypt mock to the real implementation between tests so a leftover
    // mockResolvedValueOnce from one test never leaks into the next.
    const actual = await vi.importActual<
      typeof import("@/core/storage/crypto")
    >("@/core/storage/crypto");
    vi.mocked(decrypt).mockImplementation(actual.decrypt);

    const result = await open("test-passphrase");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase(DB_NAME);
    vi.restoreAllMocks();
  });

  describe("getAllDecrypted: total decrypt failure", () => {
    it("returns an 'incorrect passphrase' error when every record fails to decrypt", async () => {
      const feed = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      await addFeed(feed);

      // Simulate reopening with a wrong passphrase by closing and reopening
      // with a different one. All existing records will fail to decrypt.
      close();
      const reopen = await open("wrong-passphrase");
      expect(isOk(reopen)).toBe(true);

      const result = await getFeeds();
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toMatch(/incorrect passphrase/i);
        expect(result.error).toMatch(/Failed to decrypt 1 records/);
      }
    });
  });

  describe("getAllDecrypted: partial decrypt failure", () => {
    it("returns successful records and warns when some — but not all — fail", async () => {
      const feedA = unwrap(
        createFeed({ url: "https://a.com/rss", title: "Feed A" }),
      );
      const feedB = unwrap(
        createFeed({ url: "https://b.com/rss", title: "Feed B" }),
      );
      await addFeed(feedA);
      await addFeed(feedB);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Force exactly one of the two decrypt calls to fail. Order of records
      // returned by Dexie isn't guaranteed, but with mockImplementationOnce
      // we just fail the first decrypt call regardless of which record it is.
      vi.mocked(decrypt).mockImplementationOnce(async () =>
        err("simulated decrypt failure"),
      );

      const result = await getFeeds();
      expect(isOk(result)).toBe(true);
      const feeds = unwrap(result);
      // One record decrypted successfully; the other was simulated as failed.
      expect(feeds).toHaveLength(1);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toMatch(/1 of 2 records/);
      expect(warnMessage).toMatch(/feeds/);
    });

    it("does not return the partial-failure error path when at least one record succeeds", async () => {
      const feedA = unwrap(
        createFeed({ url: "https://a.com/rss", title: "Feed A" }),
      );
      const feedB = unwrap(
        createFeed({ url: "https://b.com/rss", title: "Feed B" }),
      );
      await addFeed(feedA);
      await addFeed(feedB);

      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(decrypt).mockImplementationOnce(async () =>
        err("simulated decrypt failure"),
      );

      const result = await getFeeds();
      // Crucially: ok, NOT err. The "incorrect passphrase" path only fires
      // when results.length === 0.
      expect(isOk(result)).toBe(true);
    });
  });

  describe("getDecrypted: record missing iv/ciphertext", () => {
    it("returns 'Record missing encrypted data' when a record exists but has no iv/ciphertext", async () => {
      // Close the encrypted DB so we can write a malformed record via raw Dexie.
      close();
      const raw = await openRawDexie();
      try {
        await raw.table("feeds").put({ id: "malformed-feed" });
      } finally {
        raw.close();
      }

      // Reopen via the encrypted API. The record we inserted has no iv/ciphertext
      // and should hit the "missing encrypted data" branch in getDecrypted.
      const reopen = await open("test-passphrase");
      expect(isOk(reopen)).toBe(true);

      const result = await getFeed("malformed-feed");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toMatch(/missing encrypted data/i);
      }
    });

    it("returns 'Not found' when the record does not exist at all", async () => {
      const result = await getFeed("does-not-exist");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toMatch(/not found/i);
      }
    });
  });

  describe("getDecrypted: decrypt failure propagates", () => {
    it("returns the underlying decrypt error when ciphertext cannot be decrypted", async () => {
      const feed = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      await addFeed(feed);

      // Simulate a decrypt failure for the next call only — leaves on-disk
      // data untouched, so this exercises the err propagation in getDecrypted.
      vi.mocked(decrypt).mockImplementationOnce(async () =>
        err("simulated decrypt failure"),
      );

      const result = await getFeed(feed.id);
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toMatch(/simulated decrypt failure/);
      }
    });
  });

  describe("getArticleByGuid: malformed and undecryptable records", () => {
    it("returns ok(null) when the matching record has no iv/ciphertext", async () => {
      const feed = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://a.com/1",
          guid: "guid-malformed",
        }),
      );
      await addArticles([article]);

      // Strip iv/ciphertext from the on-disk article record so the lookup
      // succeeds (HMAC indexes match) but the iv/ciphertext check fails.
      // We can't close the encrypted DB without losing in-memory keys, so
      // open a parallel raw Dexie connection. fake-indexeddb permits this.
      const raw = await openRawDexie();
      try {
        const existing = await raw
          .table("articles")
          .where("id")
          .equals(article.id)
          .first();
        expect(existing).toBeDefined();
        // Keep id and HMAC index fields so the [feedId+guid] query still
        // matches; just drop the encrypted payload.
        await raw.table("articles").put({
          id: existing!.id,
          feedId: existing!.feedId,
          guid: existing!.guid,
        });
      } finally {
        raw.close();
      }

      const result = await getArticleByGuid(feed.id, "guid-malformed");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it("returns ok(null) when the record is found but decryption fails", async () => {
      const feed = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      await addFeed(feed);
      const article = unwrap(
        createArticle({
          feedId: feed.id,
          title: "Post",
          link: "https://a.com/1",
          guid: "guid-undecryptable",
        }),
      );
      await addArticles([article]);

      // The HMAC lookup needs to match (so we keep the same passphrase/keys),
      // but decrypt itself returns err. The contract is: failed decrypt is
      // treated as "not found" rather than a hard error, because the caller
      // (refresh dedup) just wants to know if a previously-seen article is
      // already on disk — a corrupt or mismatched record should not block
      // re-ingesting the article.
      vi.mocked(decrypt).mockImplementationOnce(async () =>
        err("simulated decrypt failure"),
      );

      const result = await getArticleByGuid(feed.id, "guid-undecryptable");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it("returns ok(null) when no article matches the feedId+guid pair", async () => {
      const feed = unwrap(
        createFeed({ url: "https://a.com/rss", title: "A" }),
      );
      await addFeed(feed);

      const result = await getArticleByGuid(feed.id, "no-such-guid");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });
  });

  describe("getAllDecrypted: empty table is not a passphrase mismatch", () => {
    it("returns ok([]) when the table has no records (no failedCount path)", async () => {
      const result = await getFeeds();
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual([]);
    });
  });
});

// Touching `ok` here keeps the import live; ok is currently only used inside
// the mock factory in some test variants. Marking as void keeps strict-mode
// "unused import" rules quiet without polluting test behavior.
void ok;
