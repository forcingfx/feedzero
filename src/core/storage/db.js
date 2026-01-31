import Dexie from "dexie";
import { ok, err } from "../../utils/result.js";
import { DB_NAME, DB_VERSION } from "../../utils/constants.js";
import { deriveKey, generateSalt, encrypt, decrypt } from "./crypto.js";

let db = null;
let cryptoKey = null;

/**
 * Open the database and derive encryption key from passphrase.
 * Reuses the stored salt if one exists, so the same passphrase
 * derives the same key across sessions.
 */
export async function open(passphrase) {
  try {
    db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, publishedAt, [feedId+guid]",
      meta: "key",
    });

    await db.open();

    // Reuse existing salt or generate a new one for first-time setup
    const existing = await db.meta.get("salt");
    const salt = existing ? new Uint8Array(existing.value) : generateSalt();

    const keyResult = await deriveKey(passphrase, salt);
    if (!keyResult.ok) return keyResult;
    cryptoKey = keyResult.value;

    if (!existing) {
      await db.meta.put({ key: "salt", value: Array.from(salt) });
    }

    return ok(true);
  } catch (e) {
    return err(`Failed to open database: ${e.message}`);
  }
}

/**
 * Close the database and clear key material.
 */
export function close() {
  if (db) {
    db.close();
    db = null;
  }
  cryptoKey = null;
}

/**
 * Check if a feed with the given URL already exists, using the
 * plaintext url index. Does not require decryption.
 * @param {string} url
 * @returns {Promise<Result<boolean>>}
 */
export async function feedExistsByUrl(url) {
  try {
    const count = await db.feeds.where("url").equals(url).count();
    return ok(count > 0);
  } catch (e) {
    return err(`Failed to check feed existence: ${e.message}`);
  }
}

/**
 * Add a feed (encrypted at rest).
 * Returns a friendly error if a feed with the same URL already exists.
 */
export async function addFeed(feed) {
  try {
    const exists = await feedExistsByUrl(feed.url);
    if (exists.ok && exists.value) {
      return err("A feed with this URL already exists");
    }
    return await putEncrypted("feeds", feed.id, feed);
  } catch (e) {
    if (e.name === "ConstraintError") {
      return err("A feed with this URL already exists");
    }
    return err(`Failed to add feed: ${e.message}`);
  }
}

/**
 * Get all feeds (decrypted).
 */
export async function getFeeds() {
  return getAllDecrypted("feeds");
}

/**
 * Get a single feed by id.
 */
export async function getFeed(id) {
  return getDecrypted("feeds", id);
}

/**
 * Remove all feed records matching a URL, plus their articles.
 * Used to clean up orphaned records that can't be decrypted.
 * @param {string} url
 * @returns {Promise<Result<boolean>>}
 */
export async function removeFeedsByUrl(url) {
  try {
    const records = await db.feeds.where("url").equals(url).toArray();
    for (const record of records) {
      const articleKeys = await db.articles
        .where("feedId")
        .equals(record.id)
        .primaryKeys();
      await db.articles.bulkDelete(articleKeys);
      await db.feeds.delete(record.id);
    }
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feeds by URL: ${e.message}`);
  }
}

/**
 * Remove a feed and its articles.
 */
export async function removeFeed(id) {
  try {
    await db.feeds.delete(id);
    // Delete associated articles by querying the feedId index
    const articleKeys = await db.articles
      .where("feedId")
      .equals(id)
      .primaryKeys();
    await db.articles.bulkDelete(articleKeys);
    return ok(true);
  } catch (e) {
    return err(`Failed to remove feed: ${e.message}`);
  }
}

/**
 * Add articles for a feed (encrypted at rest).
 */
export async function addArticles(articles) {
  try {
    for (const article of articles) {
      await putEncrypted("articles", article.id, article);
    }
    return ok(true);
  } catch (e) {
    return err(`Failed to add articles: ${e.message}`);
  }
}

/**
 * Get all articles for a feed (decrypted), sorted by publishedAt descending.
 */
export async function getArticles(feedId) {
  try {
    const raws = await db.articles.where("feedId").equals(feedId).toArray();
    const results = [];
    for (const raw of raws) {
      if (!raw.iv || !raw.ciphertext) continue;
      const r = await decrypt(
        cryptoKey,
        new Uint8Array(raw.iv),
        new Uint8Array(raw.ciphertext),
      );
      if (r.ok) results.push(r.value);
    }
    results.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return ok(results);
  } catch (e) {
    return err(`Failed to get articles: ${e.message}`);
  }
}

/**
 * Update an article (e.g., mark as read).
 */
export async function updateArticle(article) {
  return putEncrypted("articles", article.id, article);
}

/**
 * Find an article by its feedId + guid compound index.
 * Returns the decrypted article if found, or null.
 */
export async function getArticleByGuid(feedId, guid) {
  try {
    const raw = await db.articles
      .where("[feedId+guid]")
      .equals([feedId, guid])
      .first();
    if (!raw || !raw.iv || !raw.ciphertext) return ok(null);
    const result = await decrypt(
      cryptoKey,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
    return result.ok ? ok(result.value) : ok(null);
  } catch (e) {
    return err(`Failed to find article by guid: ${e.message}`);
  }
}

/**
 * Delete all feeds, articles, and meta (except salt) from the database.
 */
export async function clearAll() {
  try {
    await db.feeds.clear();
    await db.articles.clear();
    return ok(true);
  } catch (e) {
    return err(`Failed to clear database: ${e.message}`);
  }
}

// --- Internal helpers ---

async function putEncrypted(table, id, data) {
  try {
    const encResult = await encrypt(cryptoKey, data);
    if (!encResult.ok) return encResult;
    const { iv, ciphertext } = encResult.value;

    // Store encrypted blob with original indexes preserved for querying
    const record = {
      id,
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertext),
    };

    // Preserve indexed fields in plaintext for Dexie queries
    if (data.url !== undefined) record.url = data.url;
    if (data.feedId !== undefined) record.feedId = data.feedId;
    if (data.publishedAt !== undefined) record.publishedAt = data.publishedAt;
    if (data.guid !== undefined) record.guid = data.guid;

    await db[table].put(record);
    return ok(true);
  } catch (e) {
    return err(`Failed to store encrypted data: ${e.message}`);
  }
}

async function getDecrypted(table, id) {
  try {
    const raw = await db[table].get(id);
    if (!raw) return err("Not found");
    return decrypt(
      cryptoKey,
      new Uint8Array(raw.iv),
      new Uint8Array(raw.ciphertext),
    );
  } catch (e) {
    return err(`Failed to read encrypted data: ${e.message}`);
  }
}

async function getAllDecrypted(table) {
  try {
    const raws = await db[table].toArray();
    const results = [];
    for (const raw of raws) {
      if (!raw.iv || !raw.ciphertext) continue;
      const r = await decrypt(
        cryptoKey,
        new Uint8Array(raw.iv),
        new Uint8Array(raw.ciphertext),
      );
      if (r.ok) results.push(r.value);
    }
    return ok(results);
  } catch (e) {
    return err(`Failed to read all encrypted data: ${e.message}`);
  }
}
