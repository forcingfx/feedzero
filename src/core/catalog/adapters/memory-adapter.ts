import { markTestOnly } from "../../test-only-brand.ts";
import { ok } from "../../../utils/result.ts";
import type { CatalogFeed, CatalogStorageAdapter } from "../catalog-types.ts";

/**
 * In-memory catalog adapter for development and testing.
 *
 * Branded test-only so resolveCatalogStorage refuses to return it in
 * production — see src/core/test-only-brand.ts.
 */
export function createMemoryCatalogAdapter(): CatalogStorageAdapter {
  const store = new Map<string, CatalogFeed>();

  return markTestOnly({
    async upsert(url) {
      const now = new Date().toISOString();
      const existing = store.get(url);

      if (existing) {
        existing.requestCount += 1;
        existing.lastRequestedAt = now;
      } else {
        store.set(url, {
          url,
          title: null,
          description: null,
          siteUrl: null,
          status: "active",
          requestCount: 1,
          lastRequestedAt: now,
          lastCrawledAt: null,
          errorCount: 0,
          lastError: null,
          createdAt: now,
        });
      }

      return ok(true);
    },

    async get(url) {
      return ok(store.get(url) ?? null);
    },

    async popular(limit) {
      const sorted = [...store.values()].sort(
        (a, b) => b.requestCount - a.requestCount,
      );
      return ok(sorted.slice(0, limit));
    },

    async updateMetadata(url, metadata) {
      const existing = store.get(url);
      if (existing) {
        Object.assign(existing, metadata);
      }
      return ok(true);
    },

    async count() {
      return ok(store.size);
    },
  } satisfies CatalogStorageAdapter);
}
