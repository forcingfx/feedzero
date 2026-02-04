import type { SyncStorageAdapter } from "../types.ts";
import { createFilesystemAdapter } from "./filesystem-adapter.ts";
import { createMemoryAdapter } from "./memory-adapter.ts";
import { createVercelBlobAdapter } from "./vercel-blob-adapter.ts";

/**
 * Resolve the sync storage adapter based on the SYNC_STORAGE env var.
 * Defaults to filesystem for self-hosting.
 *
 * Supported values:
 * - "filesystem" (default) — stores vaults as JSON files on disk
 * - "vercel-blob" — uses Vercel Blob (requires BLOB_READ_WRITE_TOKEN)
 * - "memory" — in-memory storage (for dev/testing only)
 */
export function resolveAdapter(
  storage?: string,
  dataDir?: string,
): SyncStorageAdapter {
  const mode = storage ?? process.env.SYNC_STORAGE ?? "filesystem";

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
