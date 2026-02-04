import { ok, err } from "../../../utils/result.ts";
import type { SyncStorageAdapter } from "../types.ts";

/**
 * Vercel Blob storage adapter.
 * Requires `BLOB_READ_WRITE_TOKEN` environment variable.
 * Opt-in via `SYNC_STORAGE=vercel-blob`.
 */
export function createVercelBlobAdapter(): SyncStorageAdapter {
  return {
    async get(vaultId) {
      try {
        const { head } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;

        let metadata;
        try {
          metadata = await head(pathname);
        } catch {
          return ok(null);
        }

        const response = await fetch(metadata.url);
        if (!response.ok) return ok(null);
        const data = await response.text();
        return ok(data);
      } catch (e) {
        return err(`Vercel Blob get failed: ${(e as Error).message}`);
      }
    },

    async put(vaultId, data) {
      try {
        const { put } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;

        await put(pathname, data, {
          access: "public",
          addRandomSuffix: false,
          contentType: "application/json",
        });
        return ok(true);
      } catch (e) {
        return err(`Vercel Blob put failed: ${(e as Error).message}`);
      }
    },
  };
}
