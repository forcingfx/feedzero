import { ok } from "../../../../packages/core/src/utils/result";
import { markTestOnly } from "../../test-only-brand.ts";
import type { SyncStorageAdapter } from "../types.ts";

/**
 * In-memory storage adapter for development and testing.
 * Each instance has its own isolated store.
 *
 * Branded test-only so resolveAdapter refuses to return it in production
 * — see src/core/test-only-brand.ts.
 */
export function createMemoryAdapter(): SyncStorageAdapter {
  const store = new Map<string, string>();
  let lastPutAt: number | null = null;

  return markTestOnly({
    async get(vaultId) {
      return ok(store.get(vaultId) ?? null);
    },
    async put(vaultId, data) {
      store.set(vaultId, data);
      lastPutAt = Date.now();
      return ok(true);
    },
    async delete(vaultId) {
      store.delete(vaultId);
      return ok(true);
    },
    async count() {
      return ok(store.size);
    },
    async lastUpdatedAt() {
      return ok(store.size === 0 ? null : lastPutAt);
    },
  } satisfies SyncStorageAdapter);
}
