/**
 * Pick the right LicenseStorage implementation based on the environment.
 *
 * Mirrors the pattern in `src/core/sync/adapters/resolve-adapter.ts` — env
 * decides, callers never branch themselves. The whole point is that
 * server.ts / api/*.ts / vite.config.js all call this and don't have to
 * know that "missing Upstash env" means "use MemoryLicenseStorage".
 *
 * Selection rule:
 *   UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN  → UpstashLicenseStorage
 *   anything else                                       → MemoryLicenseStorage
 *
 * Memory mode is correct for dev, tests, and self-hosters who haven't set
 * up a Redis. It is NOT correct for production multi-instance Vercel
 * deployments because state is lost on cold start. The runbook will warn
 * loudly when production starts with Memory mode (follow-up).
 */

import {
  MemoryLicenseStorage,
  type LicenseStorage,
} from "./storage";
import { createUpstashLicenseStorage } from "./storage-upstash";

export async function resolveLicenseStorage(
  env: Record<string, string | undefined> = process.env,
): Promise<LicenseStorage> {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return createUpstashLicenseStorage(env);
  }
  return new MemoryLicenseStorage();
}
