import type { SyncStorageAdapter } from "../types.ts";
import { createFilesystemAdapter } from "./filesystem-adapter.ts";
import { createMemoryAdapter } from "./memory-adapter.ts";
import { createVercelBlobAdapter } from "./vercel-blob-adapter.ts";
import {
  createUpstashSyncAdapter,
  hasUpstashSyncCredentials,
} from "./upstash-adapter.ts";

/**
 * Resolve the sync storage adapter based on the runtime environment.
 *
 * Resolution order (first match wins):
 *  1. Explicit `storage` arg (caller-provided — tests/server.ts pass this).
 *  2. `process.env.SYNC_STORAGE` (operator override).
 *  3. **Upstash auto-detect** — Upstash REST credentials present (either the
 *     canonical `UPSTASH_REDIS_REST_*` or the Vercel-Marketplace-injected
 *     `KV_REST_API_*`). PR #45 prioritizes this over Vercel Blob because we
 *     are migrating *toward* Upstash; once Blob is disconnected, only this
 *     branch fires in production.
 *  4. **Vercel Blob auto-detect** — `BLOB_READ_WRITE_TOKEN` present. Kept
 *     for the migration window so an explicit `SYNC_STORAGE=vercel-blob`
 *     rollback still works.
 *  5. Fallback → `filesystem` (correct for self-hosters without either cloud).
 *
 * Supported values for `storage` / `SYNC_STORAGE`:
 *  - "upstash"     — Upstash KV (requires UPSTASH_* or KV_REST_API_* creds)
 *  - "vercel-blob" — Vercel Blob (requires BLOB_READ_WRITE_TOKEN)
 *  - "filesystem"  — stores vaults as JSON files on disk
 *  - "memory"      — in-memory storage (dev/testing only)
 *
 * Why auto-detect over a single explicit env: yesterday's 2026-05-12 sync
 * regression rooted in a stale `SYNC_STORAGE` override silently routing
 * PUTs to the filesystem adapter. Auto-detect makes the *default* path
 * follow the actual integration state — operator overrides become opt-in
 * escape hatches, not load-bearing config.
 *
 * Sync-callable signature with an async Upstash adapter: `createUpstashSyncAdapter`
 * is async (dynamic SDK import). We wrap the pending construction in a sync
 * proxy via {@link wrapAsyncAdapter} so the caller signature
 * `() => SyncStorageAdapter` is unchanged. Promises are memoized, so the SDK
 * import resolves exactly once per process; subsequent method calls go
 * straight to the underlying adapter.
 */
export function resolveAdapter(
  storage?: string,
  dataDir?: string,
): SyncStorageAdapter {
  const mode = describeAdapterMode(storage);

  switch (mode) {
    case "upstash":
      return wrapAsyncAdapter(createUpstashSyncAdapter());
    case "vercel-blob":
      return createVercelBlobAdapter();
    case "memory":
      return createMemoryAdapter();
    case "filesystem":
    default:
      return createFilesystemAdapter(
        dataDir ?? process.env.DATA_DIR ?? "./data",
      );
  }
}

/**
 * Compute the adapter mode label using the same cascade as {@link resolveAdapter}.
 *
 * The api/sync.ts module-load log surfaces this label so ops can confirm
 * which adapter resolved at cold start. `resolveAdapter` delegates to this
 * helper, so the label and the actual choice cannot drift.
 */
export function describeAdapterMode(storage?: string): string {
  const explicitMode = storage ?? process.env.SYNC_STORAGE;
  if (explicitMode) return explicitMode;
  if (hasUpstashSyncCredentials()) return "upstash";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  return "filesystem";
}

/**
 * Wrap an async adapter construction in a sync proxy. Each method awaits
 * the same underlying-adapter Promise — Promises are memoized so the SDK
 * import resolves once per process; subsequent calls reuse the cached
 * adapter directly.
 *
 * Why not just `await` at module scope: callers consume `resolveAdapter()`
 * at module load (api/sync.ts, server.ts, vite.config.js) where top-level
 * await is sometimes restricted by the Vercel bundler depending on target.
 * A sync wrapper sidesteps that entirely.
 */
function wrapAsyncAdapter(
  adapterPromise: Promise<SyncStorageAdapter>,
): SyncStorageAdapter {
  return {
    async get(vaultId) {
      return (await adapterPromise).get(vaultId);
    },
    async put(vaultId, data) {
      return (await adapterPromise).put(vaultId, data);
    },
    async delete(vaultId) {
      return (await adapterPromise).delete(vaultId);
    },
    async count() {
      return (await adapterPromise).count();
    },
  };
}
