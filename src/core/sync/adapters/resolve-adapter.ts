import type { SyncStorageAdapter } from "../types.ts";
import { createFilesystemAdapter } from "./filesystem-adapter.ts";
import { createMemoryAdapter } from "./memory-adapter.ts";
import { createVercelBlobAdapter } from "./vercel-blob-adapter.ts";

/**
 * Resolve the sync storage adapter based on the runtime environment.
 *
 * Resolution order (first match wins):
 *  1. Explicit `storage` arg (caller-provided — test/server.ts pass this)
 *  2. `process.env.SYNC_STORAGE` (operator override)
 *  3. **Auto-detect**: `process.env.BLOB_READ_WRITE_TOKEN` present → `vercel-blob`
 *     Vercel auto-injects this env var when Vercel Blob is wired up to the
 *     project, so its presence is a reliable production signal.
 *  4. Fallback → `filesystem` (correct for self-hosters without Blob)
 *
 * Supported values for `storage` / `SYNC_STORAGE`:
 *  - "vercel-blob" — uses Vercel Blob (requires BLOB_READ_WRITE_TOKEN)
 *  - "filesystem" — stores vaults as JSON files on disk
 *  - "memory" — in-memory storage (dev/testing only)
 *
 * Why auto-detect rather than relying solely on SYNC_STORAGE: the prior
 * implementation required SYNC_STORAGE to be exactly "vercel-blob", which
 * created a production fragility — any typo, whitespace, or missing value
 * silently fell through to the filesystem adapter, which then fails to
 * `mkdir` in Vercel's read-only function filesystem.
 */
export function resolveAdapter(
  storage?: string,
  dataDir?: string,
): SyncStorageAdapter {
  const mode = resolveAdapterMode(storage);

  switch (mode) {
    case "vercel-blob":
      return createVercelBlobAdapter();
    case "memory":
      return createMemoryAdapter();
    case "filesystem":
    default:
      return createFilesystemAdapter(dataDir ?? process.env.DATA_DIR ?? "./data");
  }
}

/**
 * Compute the adapter mode label using the same cascade as `resolveAdapter`.
 *
 * Why factor this out: the api/*.ts wrappers want to log which adapter is
 * resolved at module-load *before* the adapter is constructed (so a logging
 * failure can never break adapter resolution). `describeAdapterMode` and
 * `resolveAdapter` MUST agree on what they pick — `resolveAdapter` now
 * delegates here, so they cannot drift.
 *
 * This function is the answer to today's incident (2026-05-13): a single
 * `console.log("[sync] adapter=" + describeAdapterMode())` at the top of
 * api/sync.ts would have surfaced `adapter=filesystem` in the first Vercel
 * deploy log after PR W, and ops would have caught the misconfiguration
 * in minutes instead of 14 hours via a Reddit report.
 */
export function describeAdapterMode(storage?: string): string {
  const explicitMode = storage ?? process.env.SYNC_STORAGE;
  const autoDetectMode = process.env.BLOB_READ_WRITE_TOKEN
    ? "vercel-blob"
    : undefined;
  return explicitMode ?? autoDetectMode ?? "filesystem";
}

function resolveAdapterMode(storage?: string): string {
  return describeAdapterMode(storage);
}
