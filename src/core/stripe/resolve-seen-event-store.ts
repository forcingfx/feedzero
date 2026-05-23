/**
 * Resolve the SeenEventStore based on environment.
 *
 * Mirrors `src/core/license/resolve-storage.ts` — same env-var precedence
 * (UPSTASH_* canonical first, KV_REST_API_* Vercel-Marketplace legacy second),
 * same fallback to in-memory for dev/test/self-hosted-without-Redis.
 *
 * In production, the underlying Upstash REST client used here is *the same*
 * Redis as the one used by `UpstashLicenseStorage` — we just open another
 * connection. If we wanted to share one connection later, we'd extract a
 * single `createUpstashClient()` factory; for now the SDK's connection
 * pooling makes this a non-issue.
 */

import { assertNotTestOnlyInProduction } from "../test-only-brand";
import {
  MemorySeenEventStore,
  UpstashSeenEventStore,
  type SeenEventStore,
} from "./seen-event-store";
import { hasUpstashCredentials } from "../license/storage-upstash";

export async function resolveSeenEventStore(
  env: Record<string, string | undefined> = process.env,
): Promise<SeenEventStore> {
  if (!hasUpstashCredentials(env)) {
    const store = new MemorySeenEventStore();
    // NODE_ENV is a runtime property, not a credential — read from process.env
    // even when the caller passes a synthetic `env` (used for credentials only).
    assertNotTestOnlyInProduction(store, "stripe.resolveSeenEventStore");
    return store;
  }
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  // Dynamic import — keeps the SDK out of dev/test bundles when Upstash
  // is not configured.
  const { Redis } = await import("@upstash/redis");
  return new UpstashSeenEventStore(
    new Redis({ url: url as string, token: token as string }),
  );
}

/** Label form of `resolveSeenEventStore` for module-load logging. */
export function describeSeenEventStoreMode(
  env: Record<string, string | undefined> = process.env,
): "upstash" | "memory" {
  return hasUpstashCredentials(env) ? "upstash" : "memory";
}
