/**
 * Migrate orphaned sync vaults from Vercel Blob to Upstash KV.
 *
 * Background: PR #45 (2026-05-13) switched /api/sync from Vercel Blob to
 * Upstash KV without migrating the existing vault data. Vault payloads
 * stored before that PR remained in Blob under `vaults/<vaultId>.json`
 * but became unreachable from the live API. Users whose client retained
 * its local copy of the vault re-pushed on next sync and were
 * automatically migrated. Users whose local state was cleared (browser
 * data wipe, new device, etc.) saw `Vault not found` 404s on pull —
 * their vault was in Blob, the API was checking Upstash.
 *
 * This module reads every `vaults/<vaultId>.json` from Blob, writes the
 * payload string to Upstash under `vault:<vaultId>`, and (optionally,
 * with --delete-blob) removes the Blob original. The migration is:
 *
 *   - **Dry-run by default.** Reports what WOULD migrate; writes nothing.
 *   - **Idempotent.** Running twice is safe (SET is last-write-wins; no
 *     duplicate writes).
 *   - **Fail-safe on per-vault error.** A single bad blob doesn't halt
 *     the run; it's logged with the vaultId and the migration continues.
 *   - **Deletes Blob ONLY after a successful Upstash write.** If the
 *     write fails, the Blob original stays put so the next run can retry.
 *
 * The vaultId pattern (64 hex chars enforced by VAULT_ID_PATTERN in
 * `sync-handler.ts`) is re-asserted here so accidental non-vault files
 * under the `vaults/` prefix (debugging files, attacker probes, etc.)
 * are skipped rather than blindly written to Upstash.
 *
 * Tests are at `tests/core/sync/migration/blob-to-upstash.test.ts` with
 * injected fake clients. The CLI wrapper is `scripts/migrate-blob-to-upstash.ts`.
 */

/** Vault payload key in Upstash: `vault:<64-hex-vaultId>`. */
const VAULT_KEY_PREFIX = "vault:";

/** Pathname pattern in Blob: `vaults/<64-hex-vaultId>.json`. */
const BLOB_PATHNAME_PATTERN = /^vaults\/([0-9a-f]{64})\.json$/;

export interface BlobEntry {
  pathname: string;
  url: string;
  size: number;
}

export interface BlobListResult {
  blobs: BlobEntry[];
  hasMore: boolean;
  cursor: string | undefined;
}

/**
 * Minimal subset of the Vercel Blob client the migration needs. Defined
 * inline so tests can pass a fake without the real `@vercel/blob` SDK.
 */
export interface BlobListClient {
  list(opts?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<BlobListResult>;
  fetchUrl(url: string): Promise<string>;
  del(pathname: string): Promise<void>;
}

/**
 * Minimal subset of the Upstash Redis client the migration needs. The
 * production wrapper constructs the real client with
 * `automaticDeserialization: false` so the string we PUT stays a string
 * on subsequent GETs (see UpstashSyncAdapter for the same rationale).
 */
export interface UpstashSetClient {
  set(key: string, value: unknown): Promise<unknown>;
  /**
   * Required only when `skipExisting: true`. Returns the current value
   * at the key, or `null` if absent. The migration uses this to detect
   * post-#45 re-pushes that shouldn't be overwritten by the older Blob
   * copy. Optional on the type so callers that never use skipExisting
   * can pass a `set`-only client; runtime guards check before calling.
   */
  get?(key: string): Promise<string | null>;
}

export interface MigrateOptions {
  /** When false (default), no writes or deletes fire — just counts. */
  execute?: boolean;
  /** When true AND execute, deletes the Blob original after a successful
   *  Upstash write. Has no effect in dry-run. */
  deleteBlob?: boolean;
  /**
   * When true AND execute, skip any vault whose key already exists in
   * Upstash. Default false (overwrite behavior matches the initial
   * migration run). Use this on subsequent runs to avoid clobbering
   * post-#45 client re-pushes with the older Blob copy. Requires the
   * upstash client to expose `get`.
   */
  skipExisting?: boolean;
  /** Optional callback for per-vault progress logging. */
  onProgress?: (event: {
    vaultId: string;
    action: "migrated" | "deleted" | "skipped" | "skippedExisting" | "failed";
    error?: string;
  }) => void;
}

export interface MigrateResult {
  /** Total `vaults/*.json` blobs that matched the strict pattern. */
  found: number;
  /** Blobs under `vaults/` that didn't match the 64-hex pattern. */
  skipped: number;
  /** Successfully written to Upstash. Always 0 in dry-run. */
  migrated: number;
  /** Vaults skipped because they already exist in Upstash (skipExisting). */
  skippedExisting: number;
  /** Successfully deleted from Blob after Upstash write. Requires
   *  execute=true AND deleteBlob=true. */
  deleted: number;
  /** Per-vault failures (read or write). The Blob original is left
   *  intact for any failure so a retry run can recover. */
  failed: Array<{ vaultId: string; error: string }>;
}

export async function migrateBlobVaultsToUpstash(
  blob: BlobListClient,
  upstash: UpstashSetClient,
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const execute = options.execute ?? false;
  const deleteBlob = (options.deleteBlob ?? false) && execute;
  const skipExisting = (options.skipExisting ?? false) && execute;
  const onProgress = options.onProgress ?? (() => {});

  const result: MigrateResult = {
    found: 0,
    skipped: 0,
    migrated: 0,
    skippedExisting: 0,
    deleted: 0,
    failed: [],
  };

  let cursor: string | undefined = undefined;
  do {
    const page: BlobListResult = await blob.list({
      prefix: "vaults/",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const entry of page.blobs) {
      const match = BLOB_PATHNAME_PATTERN.exec(entry.pathname);
      if (!match) {
        result.skipped += 1;
        continue;
      }
      const vaultId = match[1];
      result.found += 1;

      if (!execute) {
        // Dry-run: we'd migrate this, but write nothing.
        continue;
      }

      // Skip-if-present check. Runs before the Blob read so we don't
      // waste an HTTP round-trip on data we're not going to write.
      if (skipExisting && upstash.get) {
        const existing = await upstash.get(VAULT_KEY_PREFIX + vaultId);
        if (existing !== null) {
          result.skippedExisting += 1;
          onProgress({ vaultId, action: "skippedExisting" });
          continue;
        }
      }

      // Read → write → (optional) delete. Any step's failure is
      // captured and we move on to the next vault.
      let payload: string;
      try {
        payload = await blob.fetchUrl(entry.url);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        result.failed.push({ vaultId, error: `read: ${errMsg}` });
        onProgress({ vaultId, action: "failed", error: errMsg });
        continue;
      }

      try {
        await upstash.set(VAULT_KEY_PREFIX + vaultId, payload);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        result.failed.push({ vaultId, error: `write: ${errMsg}` });
        onProgress({ vaultId, action: "failed", error: errMsg });
        // Do NOT delete the Blob original — the next run can retry.
        continue;
      }
      result.migrated += 1;
      onProgress({ vaultId, action: "migrated" });

      if (deleteBlob) {
        try {
          await blob.del(entry.pathname);
          result.deleted += 1;
          onProgress({ vaultId, action: "deleted" });
        } catch (e) {
          // Delete failure is non-fatal — the Upstash write already
          // succeeded so the migration's primary goal is met. The Blob
          // copy remains as a redundant fallback until manually cleaned.
          const errMsg = e instanceof Error ? e.message : String(e);
          onProgress({
            vaultId,
            action: "failed",
            error: `delete: ${errMsg}`,
          });
        }
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return result;
}
