import { ok } from "../../../utils/result.ts";
import type { SyncStorageAdapter } from "../types.ts";

/**
 * In-memory storage adapter for development and testing.
 * Each instance has its own isolated store.
 */
export function createMemoryAdapter(): SyncStorageAdapter {
  const store = new Map<string, string>();

  return {
    async get(vaultId) {
      return ok(store.get(vaultId) ?? null);
    },
    async put(vaultId, data) {
      store.set(vaultId, data);
      return ok(true);
    },
    async delete(vaultId) {
      store.delete(vaultId);
      return ok(true);
    },
    async count() {
      return ok(store.size);
    },
  };
}
