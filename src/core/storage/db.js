import Dexie from "dexie";
import { ok, err } from "../../utils/result.js";
import { DB_NAME, DB_VERSION } from "../../utils/constants.js";
import { deriveKey, generateSalt, encrypt, decrypt } from "./crypto.js";

let db = null;
let cryptoKey = null;

/**
 * Open the database and derive encryption key from passphrase.
 */
export async function open(passphrase) {
  try {
    const salt = generateSalt();
    const keyResult = await deriveKey(passphrase, salt);
    if (!keyResult.ok) return keyResult;
    cryptoKey = keyResult.value;

    db = new Dexie(DB_NAME);
    db.version(DB_VERSION).stores({
      feeds: "id, &url",
      articles: "id, feedId, publishedAt",
      meta: "key",
    });

    await db.open();

    // Store salt for future sessions
    await db.meta.put({ key: "salt", value: Array.from(salt) });

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
 * Add a feed (encrypted at rest).
 */
export async function addFeed(feed) {
  return putEncrypted("feeds", feed.id, feed);
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
