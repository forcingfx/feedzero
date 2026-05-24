import type {
  Feed,
  Article,
  Folder,
  SmartFilter,
  UserPreferences,
  Briefing,
} from "../../../packages/core/src/types";
import type { Result } from "../../../packages/core/src/utils/result";

/**
 * Plaintext vault structure before encryption (client-side only).
 *
 * Version history (the `version` field is informational; consumers must
 * tolerate older shapes — see the back-compat rule below):
 *  1 — feeds + articles only.
 *  2 — adds optional `folders` + `smartFilters`.
 *  3 — adds optional `preferences` + `preferencesUpdatedAt`.
 *  4 — adds optional `briefings` (Signal Briefings) + `secrets`
 *      (user-supplied API keys, e.g. Anthropic). The on-wire format
 *      version (SYNC.FORMAT_VERSION) was already bumped to 4 for
 *      gzip; this is the schema layer's v4.
 *
 * Back-compat rule (importVault, mergeVaults, importAll): a vault that
 * OMITS `folders`, `smartFilters`, `preferences`, `briefings`, or `secrets`
 * keys must NOT wipe the local rows. `undefined` = "no opinion from the
 * source"; `[]` = "the source has zero rows" and is distinct from
 * undefined. Without this the first push from an older client would
 * silently delete a newer client's data.
 *
 * Conflict model: id-keyed collections (`feeds`, `articles`, `folders`,
 * `smartFilters`, `briefings`) merge by id (local wins on collision).
 * Scalar records (`preferences`, `secrets`) CANNOT use that rule — a
 * single object would never propagate from another device. They use
 * timestamp last-write-wins (preferences) or "take whichever side has a
 * value, local wins on collision" (secrets).
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
  briefings?: Briefing[];
  /**
   * User-supplied secrets (currently only the Anthropic API key used by
   * Signal Briefings). Stored in the encrypted vault so the user
   * doesn't have to re-paste their key on every device. Merged
   * "non-empty side wins, local on collision" — a user who actively
   * deletes the key locally re-syncs an empty value, while a passive
   * mismatch picks up the other side's value.
   */
  secrets?: VaultSecrets;
}

export interface VaultSecrets {
  anthropicKey?: string;
}

/**
 * Identifies which key-derivation function was used to derive the AES key
 * that encrypted a vault's ciphertext. Stamped on the envelope so a vault
 * written with one KDF can be opened on a device whose default has since
 * moved on — the recovery flow reads this field and picks the matching
 * derivation function.
 *
 * `pbkdf2-600k` is the legacy default for envelopes written before this
 * field existed; `readKdfSpec(envelope)` returns it when the field is
 * absent. Argon2id carries its full cost triple so we can change the
 * production default without orphaning older vaults.
 */
export type KdfSpec =
  | { kind: "pbkdf2-600k" }
  | {
      kind: "argon2id";
      /** Memory cost in KiB (65536 = 64 MiB). */
      memoryKib: number;
      /** Number of passes over the memory. */
      iterations: number;
      /** Number of parallel lanes. */
      parallelism: number;
    };

/** Encrypted vault as stored on the server. */
export interface EncryptedVault {
  version: number;
  iv: number[];
  ciphertext: string;
  /**
   * Which KDF derived the encryption key. Absent on envelopes written
   * before this field existed; consumers must default to PBKDF2 via
   * `readKdfSpec()` rather than reading the field directly.
   */
  kdf?: KdfSpec;
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
