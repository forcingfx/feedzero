import { ok, err } from "../../../../packages/core/src/utils/result";
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
          allowOverwrite: true,
          contentType: "application/json",
        });
        return ok(true);
      } catch (e) {
        return err(`Vercel Blob put failed: ${(e as Error).message}`);
      }
    },

    async delete(vaultId) {
      try {
        const { del } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;
        await del(pathname);
        return ok(true);
      } catch (e) {
        return err(`Vercel Blob delete failed: ${(e as Error).message}`);
      }
    },

    async count() {
      try {
        const { list } = await import("@vercel/blob");
        let total = 0;
        let cursor: string | undefined;

        do {
          const result = await list({
            prefix: "vaults/",
            limit: 1000,
            ...(cursor ? { cursor } : {}),
          });
          total += result.blobs.length;
          cursor = result.hasMore ? result.cursor : undefined;
        } while (cursor);

        return ok(total);
      } catch (e) {
        return err(`Vercel Blob count failed: ${(e as Error).message}`);
      }
    },

    async lastUpdatedAt() {
      try {
        const { list } = await import("@vercel/blob");
        let maxMs: number | null = null;
        let cursor: string | undefined;

        do {
          const result = await list({
            prefix: "vaults/",
            limit: 1000,
            ...(cursor ? { cursor } : {}),
          });
          for (const blob of result.blobs) {
            const ms = new Date(blob.uploadedAt).getTime();
            if (maxMs === null || ms > maxMs) maxMs = ms;
          }
          cursor = result.hasMore ? result.cursor : undefined;
        } while (cursor);

        return ok(maxMs);
      } catch (e) {
        return err(`Vercel Blob lastUpdatedAt failed: ${(e as Error).message}`);
      }
    },
  };
}
