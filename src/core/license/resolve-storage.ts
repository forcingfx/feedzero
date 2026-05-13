/**
 * Pick the right LicenseStorage implementation based on the environment.
 *
 * Mirrors the pattern in `src/core/sync/adapters/resolve-adapter.ts` — env
 * decides, callers never branch themselves. The whole point is that
 * server.ts / api/*.ts / vite.config.js all call this and don't have to
 * know that "missing Upstash env" means "use MemoryLicenseStorage".
 *
 * Selection rule (Upstash credentials present → Upstash, else Memory):
 *   UPSTASH_REDIS_REST_URL    + UPSTASH_REDIS_REST_TOKEN  (canonical Upstash)
 *   KV_REST_API_URL           + KV_REST_API_TOKEN         (legacy Vercel KV
 *                                                          name; what the
 *                                                          Vercel Marketplace
 *                                                          Upstash integration
 *                                                          actually injects)
 *
 * Both pairs point at the same Upstash REST endpoint — Vercel just kept the
 * old KV-era variable names for backwards compatibility. We accept either.
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
import {
  createUpstashLicenseStorage,
  hasUpstashCredentials,
} from "./storage-upstash";

export async function resolveLicenseStorage(
  env: Record<string, string | undefined> = process.env,
): Promise<LicenseStorage> {
  if (hasUpstashCredentials(env)) {
    return createUpstashLicenseStorage(env);
  }
  return new MemoryLicenseStorage();
}

/**
 * Label form of `resolveLicenseStorage` for module-load logging. Stays in
 * sync with the resolver above because both consult the same
 * `hasUpstashCredentials` predicate.
 */
export function describeLicenseStorageMode(
  env: Record<string, string | undefined> = process.env,
): "upstash" | "memory" {
  return hasUpstashCredentials(env) ? "upstash" : "memory";
}
