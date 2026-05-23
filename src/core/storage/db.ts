import Dexie from "dexie";
import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import {
  DB_NAME,
  DB_VERSION,
  CRYPTO,
  PREFERENCES_ROW_ID,
  META_KEY,
} from "../../utils/constants.ts";
import {
  deriveKey,
  deriveHmacKey,
  hmacIndex,
  generateSalt,
  encrypt,
  decrypt,
  importCryptoKey,
  exportCryptoKey,
} from "./crypto.ts";
import type {
  Feed,
  Article,
  Folder,
  SmartFilter,
  UserPreferences,
} from "../../types/index.ts";
import { mergeDuplicateArticles } from "./dedupe-articles.ts";

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
      smartFilters: "id",
      preferences: "id",
      meta: "key",
    });

    await db.open();

    // Reuse existing salt or generate a new one for first-time setup
    const existing = await db.table("meta").get(META_KEY.SALT);
    const salt = existing ? new Uint8Array(existing.value) : generateSalt();

    const keyResult = await deriveKey(passphrase, salt);
    if (!keyResult.ok) return keyResult;
    cryptoKey = keyResult.value;

    const hmacResult = await deriveHmacKey(passphrase);
    if (!hmacResult.ok) return hmacResult;
    hmacKey = hmacResult.value;

    if (!existing) {
      await db.table("meta").put({ key: META_KEY.SALT, value: Array.from(salt) });
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
      smartFilters: "id",
      preferences: "id",
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
    const record = await db.table("meta").get(META_KEY.SALT);
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

/** Decrypt a single raw record, preserving order (no sorting/filtering). */
async function decryptRecord(
  key: CryptoKey,
  raw: DexieRecord,
): Promise<Article | null> {
  if (!raw.iv || !raw.ciphertext) return null;
  const result = await decrypt(
    key,
    new Uint8Array(raw.iv),
    new Uint8Array(raw.ciphertext),
  );
  return result.ok ? (result.value as Article) : null;
}

/**
 * Collapse duplicate article rows that share the same feedId+guid into a
 * single merged copy. Duplicates are a historical artifact of a
 * concurrent-refresh race (now prevented at the source) or arrive from a
 * sync peer that predates the fix; this removes any that already landed in
 * storage.
 *
 * Grouping keys off the HMAC-hashed index fields, so feeds with no
 * duplicates do zero decryption — only genuine duplicate groups are
 * decrypted (to merge read/starred/muted state via `mergeDuplicateArticles`)
 * and rewritten. A group is skipped if any copy fails to decrypt, so a row
 * whose state we can't read is never deleted. Pass `feedId` to scope the
 * pass to one feed (refresh self-heal); omit it to sweep every feed (boot
 * migration). Returns the number of rows removed.
 */
export async function dedupeArticles(
  feedId?: string,
): Promise<Result<number>> {
  try {
    const ctx = requireOpen();
    const table = ctx.db.table("articles");

    const raws: DexieRecord[] =
      feedId === undefined
        ? await table.toArray()
        : await table
            .where("feedId")
            .equals(await hmacIndex(ctx.hmacKey, feedId))
            .toArray();

    const groups = new Map<string, DexieRecord[]>();
    for (const raw of raws) {
      if (!raw.feedId || !raw.guid) continue;
      const key = `${raw.feedId} ${raw.guid}`;
      const existing = groups.get(key);
      if (existing) existing.push(raw);
      else groups.set(key, [raw]);
    }

    const keepers: Article[] = [];
    const idsToDelete: string[] = [];

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const decrypted = await Promise.all(
        group.map((raw) => decryptRecord(ctx.cryptoKey, raw)),
      );
      if (decrypted.some((a) => a === null)) continue;
      const articles = decrypted as Article[];
      const [base, ...others] = articles;
      keepers.push(mergeDuplicateArticles(base, others));
      for (const raw of group) {
        if (raw.id !== base.id) idsToDelete.push(raw.id);
      }
    }

    if (keepers.length > 0) {
      const records = await encryptRecords(keepers);
      await table.bulkPut(records);
    }
    if (idsToDelete.length > 0) {
      await table.bulkDelete(idsToDelete);
    }
    return ok(idsToDelete.length);
  } catch (e) {
    return err(`Failed to dedupe articles: ${(e as Error).message}`);
  }
}

/**
 * Export all user data (feeds, articles, folders, smartFilters) for
 * vault sync. Single bulk query per table.
 */
export async function exportAll(): Promise<
  Result<{
    feeds: Feed[];
    articles: Article[];
    folders: Folder[];
    smartFilters: SmartFilter[];
    preferences: UserPreferences | null;
    preferencesUpdatedAt: number | null;
  }>
> {
  try {
    const [
      feedsResult,
      articlesResult,
      foldersResult,
      filtersResult,
      prefsResult,
      prefsTsResult,
    ] = await Promise.all([
      getFeeds(),
      getAllArticles(),
      getFolders(),
      getSmartFilters(),
      getPreferences(),
      getPreferencesUpdatedAt(),
    ]);
    if (!feedsResult.ok) return feedsResult;
    if (!articlesResult.ok) return articlesResult;
    if (!foldersResult.ok) return foldersResult;
    if (!filtersResult.ok) return filtersResult;
    if (!prefsResult.ok) return prefsResult;
    if (!prefsTsResult.ok) return prefsTsResult;

    return ok({
      feeds: feedsResult.value,
      articles: articlesResult.value,
      folders: foldersResult.value,
      smartFilters: filtersResult.value,
      preferences: prefsResult.value,
      preferencesUpdatedAt: prefsTsResult.value,
    });
  } catch (e) {
    return err(`Failed to export data: ${(e as Error).message}`);
  }
}

export interface ImportAllInput {
  feeds: Feed[];
  articles: Article[];
  /** Omit (undefined) to leave the folders table untouched. */
  folders?: Folder[];
  /** Omit (undefined) to leave the smartFilters table untouched. */
  smartFilters?: SmartFilter[];
  /** Omit (undefined) to leave the preferences row untouched. */
  preferences?: UserPreferences;
  /** Timestamp to stamp alongside an imported preferences row. */
  preferencesUpdatedAt?: number;
}

/**
 * Clear and replace the provided tables atomically.
 *
 * Each table is included in the transaction (and gets clear + bulkPut)
 * ONLY when the corresponding field is present in `input`. An omitted
 * field means "the source vault has no opinion on this table" — the
 * row data is left alone. This back-compat rule keeps a pre-v2 client's
 * push from silently wiping a v2 client's folders / smartFilters.
 *
 * An explicit empty array (`[]`) IS an opinion ("the source has zero
 * rows") and clears the table; this is the distinction that makes the
 * undefined-vs-empty contract observable.
 *
 * Atomic: clear+bulkPut runs inside a single Dexie rw transaction so
 * concurrent callers (e.g. a strict-mode double-fired sync pull or a
 * boot-time refreshAll racing with initializeReturningUser) serialize
 * at the storage layer. Without the transaction, interleaved clear and
 * bulkPut sequences leave an observable window where the tables look
 * empty — the bug reproduced by tests/e2e/sync-100-feeds.spec.ts.
 *
 * Encryption happens BEFORE the transaction: Dexie's transactional zone
 * only allows awaits on Dexie operations, so awaiting Web Crypto inside
 * would render the transaction inactive.
 */
export async function importAll(
  input: ImportAllInput,
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();

    // Encrypt every batch up front; the rw transaction can only await
    // Dexie operations, never Web Crypto.
    const [feedRecords, articleRecords, folderRecords, filterRecords, prefRecords] =
      await Promise.all([
        encryptRecords(input.feeds),
        encryptRecords(input.articles),
        input.folders !== undefined
          ? encryptRecords(input.folders)
          : Promise.resolve(undefined),
        input.smartFilters !== undefined
          ? encryptRecords(input.smartFilters)
          : Promise.resolve(undefined),
        input.preferences !== undefined
          ? encryptSingleRow(ctx.cryptoKey, PREFERENCES_ROW_ID, input.preferences)
          : Promise.resolve(undefined),
      ]);

    const tables = [ctx.db.table("feeds"), ctx.db.table("articles")];
    if (folderRecords !== undefined) tables.push(ctx.db.table("folders"));
    if (filterRecords !== undefined) tables.push(ctx.db.table("smartFilters"));
    if (prefRecords !== undefined) {
      tables.push(ctx.db.table("preferences"), ctx.db.table("meta"));
    }

    const prefsTs = input.preferencesUpdatedAt ?? Date.now();

    await ctx.db.transaction("rw", tables, async () => {
      await ctx.db.table("feeds").clear();
      await ctx.db.table("articles").clear();
      await ctx.db.table("feeds").bulkPut(feedRecords);
      await ctx.db.table("articles").bulkPut(articleRecords);
      if (folderRecords !== undefined) {
        await ctx.db.table("folders").clear();
        await ctx.db.table("folders").bulkPut(folderRecords);
      }
      if (filterRecords !== undefined) {
        await ctx.db.table("smartFilters").clear();
        await ctx.db.table("smartFilters").bulkPut(filterRecords);
      }
      if (prefRecords !== undefined) {
        await ctx.db.table("preferences").clear();
        await ctx.db.table("preferences").put(prefRecords);
        await ctx.db
          .table("meta")
          .put({ key: META_KEY.PREFERENCES_UPDATED_AT, value: prefsTs });
      }
    });

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

// --- Smart filter operations ---

export async function addSmartFilter(
  filter: SmartFilter,
): Promise<Result<boolean>> {
  return putEncrypted("smartFilters", filter.id, filter);
}

export async function getSmartFilters(): Promise<Result<SmartFilter[]>> {
  return getAllDecrypted<SmartFilter>("smartFilters");
}

export async function updateSmartFilter(
  filter: SmartFilter,
): Promise<Result<boolean>> {
  return putEncrypted("smartFilters", filter.id, filter);
}

export async function removeSmartFilter(
  id: string,
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    await ctx.db.table("smartFilters").delete(id);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove smart filter: ${(e as Error).message}`);
  }
}

// --- Preferences (single-row, synced) ---

/**
 * Read the user preferences row, decrypted. Returns `ok(null)` when no row
 * exists yet (first run / pre-migration) rather than an error — callers
 * fall back to DEFAULT_PREFERENCES.
 */
export async function getPreferences(): Promise<Result<UserPreferences | null>> {
  try {
    const ctx = requireOpen();
    const raw: DexieRecord | undefined = await ctx.db
      .table("preferences")
      .get(PREFERENCES_ROW_ID);
    if (!raw || !raw.iv || !raw.ciphertext) return ok(null);
    const result = await decrypt(
      ctx.cryptoKey,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
    if (!result.ok) return result;
    return ok(result.value as UserPreferences);
  } catch (e) {
    return err(`Failed to read preferences: ${(e as Error).message}`);
  }
}

/**
 * Persist the user preferences row (encrypted) and stamp the meta
 * timestamp that drives sync last-write-wins.
 */
export async function putPreferences(
  prefs: UserPreferences,
): Promise<Result<boolean>> {
  const stored = await putEncrypted("preferences", PREFERENCES_ROW_ID, prefs);
  if (!stored.ok) return stored;
  return setPreferencesUpdatedAt(Date.now());
}

/** Epoch ms of the last local preferences write, or null if never written. */
export async function getPreferencesUpdatedAt(): Promise<Result<number | null>> {
  try {
    const ctx = requireOpen();
    const record = await ctx.db
      .table("meta")
      .get(META_KEY.PREFERENCES_UPDATED_AT);
    return ok(record ? (record.value as number) : null);
  } catch (e) {
    return err(`Failed to read preferences timestamp: ${(e as Error).message}`);
  }
}

/** Write the preferences last-modified timestamp into the meta table. */
export async function setPreferencesUpdatedAt(
  ts: number,
): Promise<Result<boolean>> {
  try {
    const ctx = requireOpen();
    await ctx.db
      .table("meta")
      .put({ key: META_KEY.PREFERENCES_UPDATED_AT, value: ts });
    return ok(true);
  } catch (e) {
    return err(`Failed to write preferences timestamp: ${(e as Error).message}`);
  }
}

// --- Internal helpers ---

/** Encrypt an array of records into Dexie-ready objects with HMAC-hashed indexes. */
async function encryptRecords(
  items: Array<Feed | Article | Folder | SmartFilter>,
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

/**
 * Encrypt a single object into a Dexie-ready record under a fixed id,
 * WITHOUT embedding the id in the ciphertext. Used for the preferences
 * row so both write paths (putPreferences and importAll) store an
 * identical, id-free payload. Returns undefined if encryption fails, which
 * the caller treats as "leave the row untouched".
 */
async function encryptSingleRow(
  key: CryptoKey,
  id: string,
  data: unknown,
): Promise<DexieRecord | undefined> {
  const encResult = await encrypt(key, data);
  if (!encResult.ok) return undefined;
  const { iv, ciphertext } = encResult.value;
  return { id, iv: Array.from(iv), ciphertext: Array.from(ciphertext) };
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
