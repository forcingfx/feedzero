import type { Feed, Article } from "../../types/index.ts";
import type { Result } from "../../utils/result.ts";

/** Plaintext vault structure before encryption (client-side only). */
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
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
}
