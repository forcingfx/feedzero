/**
 * StorageBackend — the contract every persistent-storage implementation must
 * satisfy.
 *
 * **Status: design draft (Phase 2 of ADR 023).** Defined here ahead of the
 * Dexie-extraction commit so the future @feedzero/web and @feedzero/mobile
 * implementations share one target shape. The current `src/core/storage/db.ts`
 * is the de facto reference implementation and matches this surface 1:1; it
 * will move under `packages/core/src/storage/web-storage-backend.ts` in a
 * follow-up commit. Until that commit lands, this file exports types only —
 * nothing at runtime imports it yet.
 *
 * # Why an interface
 *
 * The web app uses Dexie (IndexedDB) and React Native cannot. The CLAUDE.md
 * "mock at the boundary, not at the collaborator" rule says the boundary is
 * the network / filesystem / clock — for storage it's the underlying
 * database driver. Both impls own the same encryption-at-rest contract; the
 * only thing that differs is the row store.
 *
 * # Invariants every implementation MUST uphold
 *
 * 1. **Encrypt at rest.** Every persisted Feed / Article / Folder / SmartFilter
 *    / UserPreferences row is stored as `{ iv, ciphertext }` produced by
 *    AES-GCM-256 against the in-memory `cryptoKey`. Plaintext never touches
 *    disk except inside the `meta` table (which holds the salt, the
 *    preferences timestamp, and similarly non-sensitive scalars).
 *
 * 2. **HMAC-hashed indexes.** Any field used to look up rows without
 *    decrypting first (`feeds.url`, `articles.feedId`, `articles.guid`) is
 *    stored as the HMAC-SHA256 of its plaintext value using the in-memory
 *    `hmacKey`. The same plaintext + key always produces the same hash, so
 *    `feedExistsByUrl(url)` and `getArticles(feedId)` can be O(index) without
 *    a table scan. Hashes are NOT reversible.
 *
 * 3. **Key-data coupling** (CLAUDE.md invariant). Stored derived keys must
 *    always decrypt local rows. The only operations allowed to break that
 *    coupling are `open(passphrase)` (derives fresh keys + re-opens the DB)
 *    and `importAll()` (clears + re-encrypts all data). Any other operation
 *    that changes keys without re-encrypting, or re-encrypts without
 *    updating stored keys, is a bug.
 *
 * 4. **No auto-destroy** (ADR 018). `deleteDatabase()` is only allowed from
 *    an explicit user-confirmation UI. Boot-time canary failures route to
 *    the recovery screen, never here.
 *
 * 5. **Atomic import.** `importAll()` clears and writes the affected tables
 *    inside a single transaction. Concurrent callers (sync pull racing with
 *    refreshAll on boot) serialize at the storage layer — interleaving must
 *    not leave an observable "tables look empty" window.
 *
 * 6. **Undefined vs empty array** (ADR 019). In `ImportInput`, an `undefined`
 *    optional collection means "the source has no opinion" — leave the
 *    table alone. An empty array `[]` means "the source has zero rows" —
 *    clear the table. Implementations MUST preserve this distinction.
 *
 * # What this interface deliberately omits
 *
 * - **Schema version migrations.** Each impl owns its own migration story
 *   (Dexie `version().stores()` for web; numbered SQL migrations for mobile).
 *   The interface deals in domain entities, not schema deltas.
 *
 * - **Crypto.** `cryptoKey` and `hmacKey` are an implementation detail of
 *   each backend. The interface accepts a passphrase (for `open`) or JWKs
 *   (for `openWithKeys`) and is opaque about how they're stored.
 *
 * - **Sync.** Vault sync sits a layer above this. The backend is what the
 *   sync layer reads from and writes to via `exportAll` / `importAll`.
 *
 * @see docs/decisions/023-native-ios-via-react-native.md
 * @see docs/decisions/018-no-auto-destroy.md
 * @see docs/decisions/019-folder-sync-via-vault.md
 */

import type { Result } from "../utils/result";
import type {
  Feed,
  Article,
  Folder,
  SmartFilter,
  UserPreferences,
} from "../types";

/** Input to `importAll`. Optional collections distinguish "no opinion"
 * (`undefined`) from "explicit empty" (`[]`); see invariant #6. */
export interface ImportInput {
  feeds: Feed[];
  articles: Article[];
  /** Omit to leave the folders table untouched. */
  folders?: Folder[];
  /** Omit to leave the smartFilters table untouched. */
  smartFilters?: SmartFilter[];
  /** Omit to leave the preferences row untouched. */
  preferences?: UserPreferences;
  /** Timestamp to stamp alongside an imported preferences row. */
  preferencesUpdatedAt?: number;
}

/** Result of `exportAll`. The same shape an `ImportInput` accepts — the
 * pair forms a roundtrip used by sync vault push / pull. */
export interface ExportSnapshot {
  feeds: Feed[];
  articles: Article[];
  folders: Folder[];
  smartFilters: SmartFilter[];
  preferences: UserPreferences | null;
  preferencesUpdatedAt: number | null;
}

/** Pair of JWKs exported from an open backend; used to re-open without the
 * raw passphrase (the "stored derived keys" path on boot). */
export interface ExportedKeys {
  dbKeyJwk: JsonWebKey;
  hmacKeyJwk: JsonWebKey;
}

/**
 * The storage backend contract. One implementation per platform.
 *
 * Method groups:
 * - Lifecycle: open / openWithKeys / getSalt / exportCurrentKeys / close /
 *   deleteDatabase
 * - Feeds: feedExistsByUrl / addFeed / updateFeed / getFeed / getFeeds /
 *   removeFeed / removeFeedsByUrl
 * - Articles: addArticles / getArticles / getAllArticles / updateArticle /
 *   updateArticles / getArticleByGuid / dedupeArticles /
 *   removeArticlesByFeedId
 * - Folders: addFolder / getFolders / updateFolder / removeFolder
 * - SmartFilters: addSmartFilter / getSmartFilters / updateSmartFilter /
 *   removeSmartFilter
 * - Preferences: getPreferences / putPreferences / getPreferencesUpdatedAt /
 *   setPreferencesUpdatedAt
 * - Bulk: exportAll / importAll
 *
 * Method signatures mirror the current `src/core/storage/db.ts` exports
 * exactly. When db.ts moves under packages/core in Phase 2, the only delta
 * will be wrapping the existing function bodies inside a class that
 * implements this interface.
 */
export interface StorageBackend {
  // --- Lifecycle ---

  /** Open the database and derive encryption keys from a passphrase.
   * Reuses the stored salt if one exists so the same passphrase derives
   * the same key across sessions. */
  open(passphrase: string): Promise<Result<boolean>>;

  /** Open the database using pre-derived key material (JWKs). Used by
   * returning users whose derived keys are persisted in OS storage, so the
   * raw passphrase never needs to be kept. */
  openWithKeys(
    dbKeyJwk: JsonWebKey,
    hmacKeyJwk: JsonWebKey,
  ): Promise<Result<boolean>>;

  /** Read the PBKDF2 salt the backend stored during the first `open()`.
   * Callers (e.g. recovery flow) need this to derive matching keys. */
  getSalt(): Promise<Result<Uint8Array>>;

  /** Export the current in-memory keys as JWKs. Used when transitioning
   * from sync to local-only without the original passphrase. */
  exportCurrentKeys(): Promise<Result<ExportedKeys>>;

  /** Close the database and clear key material from memory. Idempotent. */
  close(): void;

  /** Permanently destroy the database. Per ADR 018, only callable from an
   * explicit user-confirmation UI. */
  deleteDatabase(): Promise<Result<boolean>>;

  // --- Feeds ---

  /** Probe the HMAC-hashed url index without decrypting. */
  feedExistsByUrl(url: string): Promise<Result<boolean>>;

  /** Add a feed (encrypted at rest). Returns an error if the url already exists. */
  addFeed(feed: Feed): Promise<Result<boolean>>;

  /** Update an existing feed (e.g. rename). */
  updateFeed(feed: Feed): Promise<Result<boolean>>;

  /** Get one feed by id (decrypted). */
  getFeed(id: string): Promise<Result<Feed>>;

  /** Get all feeds (decrypted). */
  getFeeds(): Promise<Result<Feed[]>>;

  /** Remove a feed and cascade-delete its articles. */
  removeFeed(id: string): Promise<Result<boolean>>;

  /** Remove every feed matching the given plaintext url. Used by the
   * URL-list-import dedupe path that can encounter the same url twice. */
  removeFeedsByUrl(url: string): Promise<Result<boolean>>;

  /** Cascade-delete every article whose feedId hashes to the given feed. */
  removeArticlesByFeedId(feedId: string): Promise<Result<boolean>>;

  // --- Articles ---

  /** Bulk-add articles (encrypted at rest) in a single write. */
  addArticles(articles: Article[]): Promise<Result<boolean>>;

  /** Articles for one feed, decrypted, sorted by publishedAt desc.
   * Optional `limit` caps the returned slice for performance. */
  getArticles(feedId: string, limit?: number): Promise<Result<Article[]>>;

  /** Articles across every feed, decrypted, sorted by publishedAt desc. */
  getAllArticles(limit?: number): Promise<Result<Article[]>>;

  /** Update a single article (e.g. mark read / starred). */
  updateArticle(article: Article): Promise<Result<boolean>>;

  /** Bulk-update articles in a single write. */
  updateArticles(articles: Article[]): Promise<Result<boolean>>;

  /** Look up an article by its `[feedId+guid]` compound index. Returns
   * `ok(null)` when not found (the natural "look before you leap" case). */
  getArticleByGuid(
    feedId: string,
    guid: string,
  ): Promise<Result<Article | null>>;

  /** Sweep duplicate articles (same hashed feedId + guid). Decrypts only
   * the groups that have duplicates, merges read/starred/muted state via
   * `mergeDuplicateArticles`, and rewrites the survivor. Skips groups where
   * any copy fails to decrypt (so a row whose state we can't read is
   * never deleted). Pass `feedId` to scope the pass; omit to sweep every
   * feed. Returns the number of rows removed. */
  dedupeArticles(feedId?: string): Promise<Result<number>>;

  // --- Folders ---

  addFolder(folder: Folder): Promise<Result<boolean>>;
  getFolders(): Promise<Result<Folder[]>>;
  updateFolder(folder: Folder): Promise<Result<boolean>>;
  removeFolder(id: string): Promise<Result<boolean>>;

  // --- Smart filters ---

  addSmartFilter(filter: SmartFilter): Promise<Result<boolean>>;
  getSmartFilters(): Promise<Result<SmartFilter[]>>;
  updateSmartFilter(filter: SmartFilter): Promise<Result<boolean>>;
  removeSmartFilter(id: string): Promise<Result<boolean>>;

  // --- Preferences (single-row, synced via vault, LWW by timestamp) ---

  /** Returns `ok(null)` when no preferences row exists yet — callers fall
   * back to DEFAULT_PREFERENCES. Never throws for the empty case. */
  getPreferences(): Promise<Result<UserPreferences | null>>;

  /** Persist preferences (encrypted) and stamp the meta timestamp that
   * drives the sync layer's last-write-wins reconciliation (ADR 022). */
  putPreferences(prefs: UserPreferences): Promise<Result<boolean>>;

  /** Epoch ms of the last local preferences write, or `null` if never
   * written. The sync layer uses this to gate routine pulls so a fresh
   * remote vault never clobbers a newer local change. */
  getPreferencesUpdatedAt(): Promise<Result<number | null>>;

  /** Write the preferences last-modified timestamp without touching the
   * preferences row itself. Used by `switchToExistingCloud` when adopting
   * a remote vault's timestamp verbatim. */
  setPreferencesUpdatedAt(ts: number): Promise<Result<boolean>>;

  // --- Bulk ---

  /** Export every collection for vault push. One bulk query per table; no
   * row-by-row chatter. */
  exportAll(): Promise<Result<ExportSnapshot>>;

  /** Clear and replace the provided tables atomically. Honors the
   * undefined-vs-empty contract (invariant #6) and the atomicity contract
   * (invariant #5). Encryption happens before the transaction because the
   * Dexie transaction zone only allows awaits on Dexie operations — mobile
   * impls SHOULD follow the same pattern. */
  importAll(input: ImportInput): Promise<Result<boolean>>;
}
