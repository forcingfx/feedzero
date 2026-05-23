/**
 * Pick the right CatalogStorageAdapter based on the environment.
 *
 * Mirrors `src/core/license/resolve-storage.ts` and
 * `src/core/sync/adapters/resolve-adapter.ts` — same env-var precedence
 * (canonical `UPSTASH_REDIS_REST_*` first, Vercel-Marketplace-injected
 * `KV_REST_API_*` second), same fallback to in-memory for dev/test.
 *
 * Memory mode is correct for tests and self-hosters who haven't set up an
 * Upstash REST integration. It is NOT correct for production multi-instance
 * Vercel deployments — every cold-started lambda gets a fresh empty map,
 * which is exactly the bug this module exists to fix. The module-load log
 * line in api/catalog.ts surfaces the resolved mode so an operator can
 * catch a regression to memory mode on first deploy.
 */

import { assertNotTestOnlyInProduction } from "../test-only-brand";
import {
  createMemoryCatalogAdapter,
} from "./adapters/memory-adapter";
import {
  createUpstashCatalogAdapter,
  hasUpstashCatalogCredentials,
} from "./adapters/upstash-adapter";
import type { CatalogStorageAdapter } from "./catalog-types";

export async function resolveCatalogStorage(
  env: Record<string, string | undefined> = process.env,
): Promise<CatalogStorageAdapter> {
  if (hasUpstashCatalogCredentials(env)) {
    return createUpstashCatalogAdapter(env);
  }
  const adapter = createMemoryCatalogAdapter();
  // NODE_ENV is a runtime property, not a credential — read from process.env
  // even when the caller passes a synthetic `env` (the test/server use it for
  // Upstash credentials only).
  assertNotTestOnlyInProduction(adapter, "catalog.resolveCatalogStorage");
  return adapter;
}

/** Label form of `resolveCatalogStorage` for module-load logging. */
export function describeCatalogStorageMode(
  env: Record<string, string | undefined> = process.env,
): "upstash" | "memory" {
  return hasUpstashCatalogCredentials(env) ? "upstash" : "memory";
}
