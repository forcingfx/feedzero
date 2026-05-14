import Dexie from "dexie";
import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { DB_NAME, DB_VERSION, CRYPTO } from "../../utils/constants.ts";
import {
  deriveKey,
  deriveHmacKey,
  hmacIndex,
  generateSalt,
  encrypt,
  decrypt,
  importCryptoKey,
} from "./crypto.ts";
import type { Feed, Article, Folder } from "../../types/index.ts";

interface DexieRecord {
  id: string;
  iv?: number[];
  ciphertext?: number[];
  url?: string;
  feedId?: string;
  guid?: string;
  [key: string]: unknown;
}

let db: Dexie | null = null;
let cryptoKey: CryptoKey | null = null;
let hmacKey: CryptoKey | null = null;

/** Asserts the database is open and keys are available. */
function requireOpen(): { db: Dexie; cryptoKey: CryptoKey; hmacKey: CryptoKey } {
  if (!db || !cryptoKey || !hmacKey) {
    throw new Error(
      "Database not initialized. Call open() or openWithKeys() first.",
    );
  }
  return { db, cryptoKey, hmacKey };
}

/**
 * Open the database and derive encryption key from passphrase.
 * Reuses the stored salt if one exists, so the same passphrase
 * derives the same key across sessions.
 */
export async function open(passphrase: string): Promise<Result<boolean>> {
  try {
    db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, [feedId+guid]",
      folders: "id",
      meta: "key",
    });

    await db.open();

    // Reuse existing salt or generate a new one for first-time setup
    const existing = await db.table("meta").get("salt");
    const salt = existing ? new Uint8Array(existing.value) : generateSalt();

    const keyResult = await deriveKey(passphrase, salt);
    if (!keyResult.ok) return keyResult;
    cryptoKey = keyResult.value;

    const hmacResult = await deriveHmacKey(passphrase);
    if (!hmacResult.ok) return hmacResult;
    hmacKey = hmacResult.value;

    if (!existing) {
      await db.table("meta").put({ key: "salt", value: Array.from(salt) });
    }

    return ok(true);
  } catch (e) {
    return err(`Failed to open database: ${(e as Error).message}`);
  }
}

/**
 * Open the database using pre-derived key material (JWKs).
 * Used by returning users who have exported keys stored in localStorage,
 * avoiding the need to store the raw passphrase.
 */
export async function openWithKeys(
  dbKeyJwk: JsonWebKey,
  hmacKeyJwk: JsonWebKey,
): Promise<Result<boolean>> {
  try {
    db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, [feedId+guid]",
      folders: "id",
      meta: "key",
    });

    await db.open();

    cryptoKey = await importCryptoKey(dbKeyJwk, {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH,
    });
    hmacKey = await importCryptoKey(hmacKeyJwk, {
      name: "HMAC",
      hash: CRYPTO.HASH,
    });

    return ok(true);
  } catch (e) {
    return err(`Failed to open database with keys: ${(e as Error).message}`);
  }
}

/**
 * Read the PBKDF2 salt stored in the meta table during open().
 * Callers need this to derive keys that match the ones used for encryption.
 */
export async function getSalt(): Promise<Result<Uint8Array>> {
  try {
    if (!db) return err("Database not open");
    const record = await db.table("meta").get("salt");
    if (!record) return err("No salt found");
    return ok(new Uint8Array(record.value));
  } catch (e) {
    return err(`Failed to read salt: ${(e as Error).message}`);
  }
}

/**
 * Export the current in-memory keys as JWKs.
 * Used when transitioning from sync to local-only to re-persist keys
 * without the original passphrase.
 */
export async function exportCurrentKeys(): Promise<
  Result<{ dbKeyJwk: JsonWebKey; hmacKeyJwk: JsonWebKey }>
> {
  try {
    const ctx = requireOpen();
    const { exportCryptoKey } = await import("./crypto.ts");
    const dbKeyJwk = await exportCryptoKey(ctx.cryptoKey);
    const hmacKeyJwk = await exportCryptoKey(ctx.hmacKey);
    return ok({ dbKeyJwk, hmacKeyJwk });
  } catch (e) {
    return err(`Failed to export keys: ${(e as Error).message}`);
  }
}

/**
 * Close the database and clear key material.
 */
export function close(): void {
  if (db) {
    db.close();
    db = null;
  }
  cryptoKey = null;
  hmacKey = null;
}

/**
 * Delete the entire database and clear key material.
 * This permanently destroys all data.
 */
export async function deleteDatabase(): Promise<Result<boolean>> {
  try {
    close();
    await Dexie.delete(DB_NAME);
    return ok(true);
  } catch (e) {
    return err(`Failed to delete database: ${(e as Error).message}`);
  }
}

/**
 * Check if a feed with the given URL already exists, using the
 * HMAC-hashed url index. Does not require decryption.
 */
export async function feedExistsByUrl(url: string): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    const hashedUrl = await hmacIndex(ctx.hmacKey, url);
    const count = await ctx.db
      .table("feeds")
      .where("url")
      .equals(hashedUrl)
      .count();
    return ok(count > 0);
  } catch (e) {
    return err(`Failed to check feed existence: ${(e as Error).message}`);
  }
}

/**
 * Add a feed (encrypted at rest).
 * Returns a friendly error if a feed with the same URL already exists.
 */
export async function addFeed(feed: Feed): Promise<Result<boolean>> {
  try {
    const exists = await feedExistsByUrl(feed.url);
    if (exists.ok && exists.value) {
      return err("A feed with this URL already exists");
    }
    return await putEncrypted("feeds", feed.id, feed);
  } catch (e) {
    if ((e as { name?: string }).name === "ConstraintError") {
      return err("A feed with this URL already exists");
    }
    return err(`Failed to add feed: ${(e as Error).message}`);
  }
}

/** Update an existing feed (e.g., rename). */
export async function updateFeed(feed: Feed): Promise<Result<boolean>> {
  return putEncrypted("feeds", feed.id, feed);
}

/**
 * Get all feeds (decrypted).
 */
export async function getFeeds(): Promise<Result<Feed[]>> {
  return getAllDecrypted<Feed>("feeds");
}

/**
 * Get a single feed by id.
 */
export async function getFeed(id: string): Promise<Result<Feed>> {
  return getDecrypted<Feed>("feeds", id);
}

/**
 * Remove all feed records matching a URL, plus their articles.
 * Used to clean up orphaned records that can't be decrypted.
 */
export async function removeFeedsByUrl(url: string): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    const hashedUrl = await hmacIndex(ctx.hmacKey, url);
    const records = await ctx.db
      .table("feeds")
      .where("url")
      .equals(hashedUrl)
      .toArray();
    for (const record of records) {
      const hashedFeedId = await hmacIndex(ctx.hmacKey, record.id);
      const articleKeys = await ctx.db
        .table("articles")
        .where("feedId")
        .equals(hashedFeedId)
        .primaryKeys();
      await ctx.db.table("articles").bulkDelete(articleKeys);
      await ctx.db.table("feeds").delete(record.id);
    }
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feeds by URL: ${(e as Error).message}`);
  }
}

/** Delete all articles for a feed without removing the feed itself. */
export async function removeArticlesByFeedId(feedId: string): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    const hashedFeedId = await hmacIndex(ctx.hmacKey, feedId);
    const articleKeys = await ctx.db
      .table("articles")
      .where("feedId")
      .equals(hashedFeedId)
      .primaryKeys();
    await ctx.db.table("articles").bulkDelete(articleKeys);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove articles: ${(e as Error).message}`);
  }
}

/**
 * Remove a feed and its articles.
 */
export async function removeFeed(id: string): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    await ctx.db.table("feeds").delete(id);
    const hashedFeedId = await hmacIndex(ctx.hmacKey, id);
    const articleKeys = await ctx.db
      .table("articles")
      .where("feedId")
      .equals(hashedFeedId)
      .primaryKeys();
    await ctx.db.table("articles").bulkDelete(articleKeys);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feed: ${(e as Error).message}`);
  }
}

/**
 * Add articles for a feed (encrypted at rest).
 * Encrypts all articles then writes in a single bulk operation.
 */
export async function addArticles(
  articles: Article[],
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    const records = await encryptRecords(articles);
    await ctx.db.table("articles").bulkPut(records);
    return ok(true);
  } catch (e) {
    return err(`Failed to add articles: ${(e as Error).message}`);
  }
}

/**
 * Decrypt raw article records in parallel and sort by publishedAt descending.
 */
async function decryptAndSortArticles(raws: DexieRecord[]): Promise<Article[]> {
  const { cryptoKey: key } = requireOpen();
  const decrypted = await Promise.all(
    raws
      .filter((raw) => raw.iv && raw.ciphertext)
      .map((raw) =>
        decrypt(key, new Uint8Array(raw.iv!), new Uint8Array(raw.ciphertext!)),
      ),
  );
  const results = decrypted
    .filter((r) => r.ok)
    .map((r) => r.value as Article);
  results.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  return results;
}

/**
 * Get all articles for a feed (decrypted), sorted by publishedAt descending.
 */
export async function getArticles(
  feedId: string,
  limit?: number,
): Promise<Result<Article[]>> {
  try {
    const ctx = requireOpen();
    const hashedFeedId = await hmacIndex(ctx.hmacKey, feedId);
    const raws: DexieRecord[] = await ctx.db
      .table("articles")
      .where("feedId")
      .equals(hashedFeedId)
      .toArray();
    const articles = await decryptAndSortArticles(raws);
    return ok(limit ? articles.slice(0, limit) : articles);
  } catch (e) {
    return err(`Failed to get articles: ${(e as Error).message}`);
  }
}

/**
 * Get all articles from all feeds (decrypted), sorted by publishedAt descending.
 * Optional limit caps the number of returned articles for performance.
 */
export async function getAllArticles(
  limit?: number,
): Promise<Result<Article[]>> {
  try {
    const ctx = requireOpen();
    const raws: DexieRecord[] = await ctx.db.table("articles").toArray();
    const articles = await decryptAndSortArticles(raws);
    return ok(limit ? articles.slice(0, limit) : articles);
  } catch (e) {
    return err(`Failed to get all articles: ${(e as Error).message}`);
  }
}

/**
 * Update an article (e.g., mark as read).
 */
export async function updateArticle(
  article: Article,
): Promise<Result<boolean>> {
  return putEncrypted("articles", article.id, article);
}

/**
 * Update multiple articles in a single bulk operation.
 */
export async function updateArticles(
  articles: Article[],
): Promise<Result<boolean>> {
  if (articles.length === 0) return ok(true);
  try {
    const ctx = requireOpen();
    const records = await encryptRecords(articles);
    await ctx.db.table("articles").bulkPut(records);
    return ok(true);
  } catch (e) {
    return err(`Failed to update articles: ${(e as Error).message}`);
  }
}

/**
 * Find an article by its feedId + guid compound index.
 * Returns the decrypted article if found, or null.
 */
export async function getArticleByGuid(
  feedId: string,
  guid: string,
): Promise<Result<Article | null>> {
  try {
    const ctx = requireOpen();
    const hashedFeedId = await hmacIndex(ctx.hmacKey, feedId);
    const hashedGuid = await hmacIndex(ctx.hmacKey, guid);
    const raw: DexieRecord | undefined = await ctx.db
      .table("articles")
      .where("[feedId+guid]")
      .equals([hashedFeedId, hashedGuid])
      .first();
    if (!raw || !raw.iv || !raw.ciphertext) return ok(null);
    const result = await decrypt(
      ctx.cryptoKey,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
    return result.ok ? ok(result.value as Article) : ok(null);
  } catch (e) {
    return err(`Failed to find article by guid: ${(e as Error).message}`);
  }
}

/**
 * Export all feeds and articles (decrypted) for vault sync.
 * Uses getAllArticles() for a single bulk query instead of per-feed queries.
 */
export async function exportAll(): Promise<
  Result<{ feeds: Feed[]; articles: Article[] }>
> {
  try {
    const feedsResult = await getFeeds();
    if (!feedsResult.ok) return feedsResult;

    const articlesResult = await getAllArticles();
    if (!articlesResult.ok) return articlesResult;

    return ok({ feeds: feedsResult.value, articles: articlesResult.value });
  } catch (e) {
    return err(`Failed to export data: ${(e as Error).message}`);
  }
}

/**
 * Clear all feeds and articles, then import the provided data.
 * Atomic: clear+bulkPut runs inside a single Dexie rw transaction so
 * concurrent callers (e.g. a strict-mode double-fired sync pull or a
 * boot-time refreshAll racing with initializeReturningUser) serialize
 * at the storage layer. Without the transaction, interleaved clear and
 * bulkPut sequences leave an observable window where the tables look
 * empty — which is the bug reproduced by tests/e2e/sync-100-feeds.spec.ts.
 *
 * Encryption happens BEFORE the transaction: Dexie's transactional zone
 * only allows awaits on Dexie operations, so awaiting Web Crypto inside
 * would render the transaction inactive.
 */
export async function importAll(
  feeds: Feed[],
  articles: Article[],
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();

    const [feedRecords, articleRecords] = await Promise.all([
      encryptRecords(feeds),
      encryptRecords(articles),
    ]);

    await ctx.db.transaction(
      "rw",
      [ctx.db.table("feeds"), ctx.db.table("articles")],
      async () => {
        await ctx.db.table("feeds").clear();
        await ctx.db.table("articles").clear();
        await ctx.db.table("feeds").bulkPut(feedRecords);
        await ctx.db.table("articles").bulkPut(articleRecords);
      },
    );

    return ok(true);
  } catch (e) {
    return err(`Failed to import data: ${(e as Error).message}`);
  }
}

// --- Folder operations ---

export async function addFolder(folder: Folder): Promise<Result<boolean>> {
  return putEncrypted("folders", folder.id, folder);
}

export async function getFolders(): Promise<Result<Folder[]>> {
  return getAllDecrypted<Folder>("folders");
}

export async function updateFolder(folder: Folder): Promise<Result<boolean>> {
  return putEncrypted("folders", folder.id, folder);
}

export async function removeFolder(id: string): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    await ctx.db.table("folders").delete(id);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove folder: ${(e as Error).message}`);
  }
}

// --- Internal helpers ---

/** Encrypt an array of records into Dexie-ready objects with HMAC-hashed indexes. */
async function encryptRecords(
  items: Array<Feed | Article>,
): Promise<DexieRecord[]> {
  const ctx = requireOpen();
  const records: DexieRecord[] = [];
  for (const item of items) {
    const encResult = await encrypt(ctx.cryptoKey, item);
    if (!encResult.ok) continue;
    const { iv, ciphertext } = encResult.value;

    const record: DexieRecord = {
      id: item.id,
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
    };

    if ("url" in item && item.url !== undefined)
      record.url = await hmacIndex(ctx.hmacKey, item.url);
    if ("feedId" in item && item.feedId !== undefined)
      record.feedId = await hmacIndex(ctx.hmacKey, item.feedId);
    if ("guid" in item && item.guid !== undefined)
      record.guid = await hmacIndex(ctx.hmacKey, item.guid);

    records.push(record);
  }
  return records;
}

async function putEncrypted(
  table: string,
  id: string,
  data: unknown,
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    const encResult = await encrypt(ctx.cryptoKey, data);
    if (!encResult.ok) return encResult;
    const { iv, ciphertext } = encResult.value;

    const record: DexieRecord = {
      id,
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
    };

    const d = data as Record<string, unknown>;
    if (d.url !== undefined)
      record.url = await hmacIndex(ctx.hmacKey, d.url as string);
    if (d.feedId !== undefined)
      record.feedId = await hmacIndex(ctx.hmacKey, d.feedId as string);
    if (d.guid !== undefined)
      record.guid = await hmacIndex(ctx.hmacKey, d.guid as string);

    await ctx.db.table(table).put(record);
    return ok(true);
  } catch (e) {
    return err(`Failed to store encrypted data: ${(e as Error).message}`);
  }
}

async function getDecrypted<T>(table: string, id: string): Promise<Result<T>> {
  try {
    const ctx = requireOpen();
    const raw: DexieRecord | undefined = await ctx.db.table(table).get(id);
    if (!raw) return err("Not found");
    if (!raw.iv || !raw.ciphertext) return err("Record missing encrypted data");
    const result = await decrypt(
      ctx.cryptoKey,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
    if (!result.ok) return result;
    return ok(result.value as T);
  } catch (e) {
    return err(`Failed to read encrypted data: ${(e as Error).message}`);
  }
}

async function getAllDecrypted<T>(table: string): Promise<Result<T[]>> {
  try {
    const ctx = requireOpen();
    const raws: DexieRecord[] = await ctx.db.table(table).toArray();
    const results: T[] = [];
    let failedCount = 0;

    for (const raw of raws) {
      if (!raw.iv || !raw.ciphertext) continue;
      const r = await decrypt(
        ctx.cryptoKey,
        new Uint8Array(raw.iv),
        new Uint8Array(raw.ciphertext),
      );
      if (r.ok) {
        results.push(r.value as T);
      } else {
        failedCount++;
      }
    }

    // If records exist but ALL failed to decrypt, likely a passphrase mismatch
    if (raws.length > 0 && results.length === 0 && failedCount > 0) {
      return err(
        `Failed to decrypt ${failedCount} records. This may indicate an incorrect passphrase.`,
      );
    }

    // Log warning if some (but not all) records failed - possible data corruption
    if (failedCount > 0 && results.length > 0) {
      console.warn(
        `[db] ${failedCount} of ${raws.length} records in "${table}" failed to decrypt`,
      );
    }

    return ok(results);
  } catch (e) {
    return err(`Failed to read all encrypted data: ${(e as Error).message}`);
  }
}
