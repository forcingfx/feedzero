import type {
  Feed,
  Article,
  Folder,
  SmartFilter,
  UserPreferences,
} from "../../types/index.ts";
import type { Result } from "../../utils/result.ts";

/**
 * Plaintext vault structure before encryption (client-side only).
 *
 * Version history (the `version` field is informational; consumers must
 * tolerate older shapes — see the back-compat rule below):
 *  1 — feeds + articles only.
 *  2 — adds optional `folders` + `smartFilters`.
 *  3 — adds optional `preferences` + `preferencesUpdatedAt` (this version).
 *
 * Back-compat rule (importVault, mergeVaults, importAll): a vault that
 * OMITS `folders`, `smartFilters`, or `preferences` keys must NOT wipe the
 * local rows. `undefined` = "no opinion from the source"; `[]` = "the
 * source has zero rows" and is distinct from undefined. Without this the
 * first push from an older client would silently delete a newer client's
 * organisational data.
 *
 * Conflict model: `feeds`/`articles`/`folders`/`smartFilters` are id-keyed
 * collections merged by id/url (local wins on collision). `preferences` is
 * a scalar record, so it CANNOT use that rule — a single object would never
 * propagate from another device. It uses timestamp last-write-wins via
 * `preferencesUpdatedAt` instead (newer wins; ties favor local).
 */
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
  folders?: Folder[];
  smartFilters?: SmartFilter[];
  preferences?: UserPreferences;
  /** Epoch ms of the last preferences write; drives the LWW merge. */
  preferencesUpdatedAt?: number;
}

/** Encrypted vault as stored on the server. */
export interface EncryptedVault {
  version: number;
  iv: number[];
  ciphertext: string;
}

/** Server response shape for sync API. */
export interface SyncResponse {
  ok: boolean;
  error?: string;
  vault?: EncryptedVault;
  updatedAt?: number;
}

/**
 * Storage adapter interface for vault persistence (server-side).
 *
 * @invariant Atomicity: `put(id, data)` MUST be atomic relative to any
 *   concurrent `get(id)`. A reader either sees the previous value or the
 *   new value, never a partial / torn write. Adapters backed by services
 *   with native atomic SET (Upstash, Vercel Blob, memory Map) get this
 *   for free; the filesystem adapter writes to a sibling tmp file then
 *   renames. Violating this invariant produces silent corruption (e.g.
 *   `JSON.parse: unterminated string`) on the client — the bug class
 *   from issue #117.
 *
 * @invariant Idempotency: `delete(id)` of a missing key returns `ok`,
 *   not an error. Callers (sync handler, recovery flows) rely on this.
 *
 * Every adapter implementation MUST pass the conformance suite at
 * tests/core/sync/adapters/concurrency-contract.test.ts.
 */
export interface SyncStorageAdapter {
  get(vaultId: string): Promise<Result<string | null>>;
  put(vaultId: string, data: string): Promise<Result<boolean>>;
  delete(vaultId: string): Promise<Result<boolean>>;
  count(): Promise<Result<number>>;
  /**
   * Epoch milliseconds of the most recent successful `put`, or `null` if
   * no vaults exist. Surfaced via `/api/stats-sync` so operators can verify
   * sync PUTs are still landing from a single mobile-friendly URL — the
   * proximate motivation was the post-#117 "is anyone actually syncing?"
   * question with no good answer short of trawling Vercel logs.
   *
   * Resolution is best-effort and adapter-specific: filesystem uses file
   * mtime (1-second granularity on most volumes), Upstash uses a meta key
   * updated synchronously on every put, Vercel Blob queries blob upload
   * timestamps. Don't rely on sub-second precision.
   */
  lastUpdatedAt(): Promise<Result<number | null>>;
}
