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
import type { Feed, Article } from "../../types/index.ts";

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

/**
 * Open the database and derive encryption key from passphrase.
 * Reuses the stored salt if one exists, so the same passphrase
 * derives the same key across sessions.
 */
export async function open(passphrase: string): Promise<Result<boolean>> {
  try {
    db = new Dexie(DB_NAME);
    db.version(2).stores({
      feeds: "id, &url",
      articles: "id, feedId, publishedAt, [feedId+guid]",
      meta: "key",
    });
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, [feedId+guid]",
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
    db.version(2).stores({
      feeds: "id, &url",
      articles: "id, feedId, publishedAt, [feedId+guid]",
      meta: "key",
    });
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, [feedId+guid]",
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
    const hashedUrl = await hmacIndex(hmacKey!, url);
    const count = await db!
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
    const hashedUrl = await hmacIndex(hmacKey!, url);
    const records = await db!
      .table("feeds")
      .where("url")
      .equals(hashedUrl)
      .toArray();
    for (const record of records) {
      const hashedFeedId = await hmacIndex(hmacKey!, record.id);
      const articleKeys = await db!
        .table("articles")
        .where("feedId")
        .equals(hashedFeedId)
        .primaryKeys();
      await db!.table("articles").bulkDelete(articleKeys);
      await db!.table("feeds").delete(record.id);
    }
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feeds by URL: ${(e as Error).message}`);
  }
}

/**
 * Remove a feed and its articles.
 */
export async function removeFeed(id: string): Promise<Result<boolean>> {
  try {
    await db!.table("feeds").delete(id);
    // Delete associated articles by querying the HMAC-hashed feedId index
    const hashedFeedId = await hmacIndex(hmacKey!, id);
    const articleKeys = await db!
      .table("articles")
      .where("feedId")
      .equals(hashedFeedId)
      .primaryKeys();
    await db!.table("articles").bulkDelete(articleKeys);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feed: ${(e as Error).message}`);
  }
}

/**
 * Add articles for a feed (encrypted at rest).
 */
export async function addArticles(
  articles: Article[],
): Promise<Result<boolean>> {
  try {
    for (const article of articles) {
      await putEncrypted("articles", article.id, article);
    }
    return ok(true);
  } catch (e) {
    return err(`Failed to add articles: ${(e as Error).message}`);
  }
}

/**
 * Decrypt raw article records and sort by publishedAt descending.
 */
async function decryptAndSortArticles(raws: DexieRecord[]): Promise<Article[]> {
  const results: Article[] = [];
  for (const raw of raws) {
    if (!raw.iv || !raw.ciphertext) continue;
    const r = await decrypt(
      cryptoKey!,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
    if (r.ok) results.push(r.value as Article);
  }
  results.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  return results;
}

/**
 * Get all articles for a feed (decrypted), sorted by publishedAt descending.
 */
export async function getArticles(feedId: string): Promise<Result<Article[]>> {
  try {
    const hashedFeedId = await hmacIndex(hmacKey!, feedId);
    const raws: DexieRecord[] = await db!
      .table("articles")
      .where("feedId")
      .equals(hashedFeedId)
      .toArray();
    return ok(await decryptAndSortArticles(raws));
  } catch (e) {
    return err(`Failed to get articles: ${(e as Error).message}`);
  }
}

/**
 * Get all articles from all feeds (decrypted), sorted by publishedAt descending.
 */
export async function getAllArticles(): Promise<Result<Article[]>> {
  try {
    const raws: DexieRecord[] = await db!.table("articles").toArray();
    return ok(await decryptAndSortArticles(raws));
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
 * Find an article by its feedId + guid compound index.
 * Returns the decrypted article if found, or null.
 */
export async function getArticleByGuid(
  feedId: string,
  guid: string,
): Promise<Result<Article | null>> {
  try {
    const hashedFeedId = await hmacIndex(hmacKey!, feedId);
    const hashedGuid = await hmacIndex(hmacKey!, guid);
    const raw: DexieRecord | undefined = await db!
      .table("articles")
      .where("[feedId+guid]")
      .equals([hashedFeedId, hashedGuid])
      .first();
    if (!raw || !raw.iv || !raw.ciphertext) return ok(null);
    const result = await decrypt(
      cryptoKey!,
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
 */
export async function exportAll(): Promise<
  Result<{ feeds: Feed[]; articles: Article[] }>
> {
  try {
    const feedsResult = await getFeeds();
    if (!feedsResult.ok) return feedsResult;

    const allArticles: Article[] = [];
    for (const feed of feedsResult.value) {
      const articlesResult = await getArticles(feed.id);
      if (articlesResult.ok) {
        allArticles.push(...articlesResult.value);
      }
    }

    return ok({ feeds: feedsResult.value, articles: allArticles });
  } catch (e) {
    return err(`Failed to export data: ${(e as Error).message}`);
  }
}

/**
 * Clear all feeds and articles, then import the provided data.
 * Used for vault sync restore.
 */
export async function importAll(
  feeds: Feed[],
  articles: Article[],
): Promise<Result<boolean>> {
  try {
    await db!.table("feeds").clear();
    await db!.table("articles").clear();

    for (const feed of feeds) {
      const result = await putEncrypted("feeds", feed.id, feed);
      if (!result.ok) return result;
    }
    for (const article of articles) {
      const result = await putEncrypted("articles", article.id, article);
      if (!result.ok) return result;
    }

    return ok(true);
  } catch (e) {
    return err(`Failed to import data: ${(e as Error).message}`);
  }
}

// --- Internal helpers ---

async function putEncrypted(
  table: string,
  id: string,
  data: unknown,
): Promise<Result<boolean>> {
  try {
    const encResult = await encrypt(cryptoKey!, data);
    if (!encResult.ok) return encResult;
    const { iv, ciphertext } = encResult.value;

    const record: DexieRecord = {
      id,
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
    };

    // HMAC-hash indexed fields for Dexie queries (hides plaintext values)
    const d = data as Record<string, unknown>;
    if (d.url !== undefined)
      record.url = await hmacIndex(hmacKey!, d.url as string);
    if (d.feedId !== undefined)
      record.feedId = await hmacIndex(hmacKey!, d.feedId as string);
    if (d.guid !== undefined)
      record.guid = await hmacIndex(hmacKey!, d.guid as string);

    await db!.table(table).put(record);
    return ok(true);
  } catch (e) {
    return err(`Failed to store encrypted data: ${(e as Error).message}`);
  }
}

async function getDecrypted<T>(table: string, id: string): Promise<Result<T>> {
  try {
    const raw: DexieRecord | undefined = await db!.table(table).get(id);
    if (!raw) return err("Not found");
    const result = await decrypt(
      cryptoKey!,
      new Uint8Array(raw.iv!),
      new Uint8Array(raw.ciphertext!),
    );
    if (!result.ok) return result;
    return ok(result.value as T);
  } catch (e) {
    return err(`Failed to read encrypted data: ${(e as Error).message}`);
  }
}

async function getAllDecrypted<T>(table: string): Promise<Result<T[]>> {
  try {
    const raws: DexieRecord[] = await db!.table(table).toArray();
    const results: T[] = [];
    let failedCount = 0;

    for (const raw of raws) {
      if (!raw.iv || !raw.ciphertext) continue;
      const r = await decrypt(
        cryptoKey!,
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
