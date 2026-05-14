/**
 * Resolve a production rate limiter from environment configuration.
 *
 * Returns `undefined` when the limiter shouldn't run (no Upstash creds,
 * or no salt). The proxy handler's `rateLimit?` option is opt-in, so
 * undefined cleanly disables rate limiting in dev / self-host / preview
 * environments where Upstash isn't configured.
 *
 * Salt sourcing (load-bearing for anonymity):
 *   1. `RATE_LIMIT_HASH_SALT` env var (explicit, operator-controlled).
 *   2. `LICENSE_SIGNING_KEY` env var (already required in production,
 *      high entropy, already secret-scoped in Vercel).
 *   3. None → return undefined. Fail-CLOSED on salt because a limiter
 *      without a salt persists hashes that are rainbow-attackable on
 *      common IP+UA pairs; better to not rate-limit than to compromise
 *      anonymity.
 */

import type { ProxyRateLimit } from "./proxy-handler";
import {
  UpstashRateLimiter,
  hashClientId,
} from "./rate-limiter";

/**
 * Defaults chosen to accommodate a "refresh all" of a 200-feed folder
 * (which can fire 200 requests in 1 burst) without false-positive 429s,
 * while still blocking sustained 5+ req/sec abuse. Tunable via the
 * options arg if a route wants tighter limits.
 */
const DEFAULT_LIMIT = 300;
const DEFAULT_WINDOW_SEC = 60;

export interface RateLimiterConfig {
  limit?: number;
  windowSec?: number;
}

function hasUpstashCreds(
  env: Record<string, string | undefined>,
): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function resolveSalt(
  env: Record<string, string | undefined>,
): string | null {
  const explicit = env.RATE_LIMIT_HASH_SALT;
  if (explicit && explicit.length > 0) return explicit;
  const fallback = env.LICENSE_SIGNING_KEY;
  if (fallback && fallback.length > 0) return fallback;
  return null;
}

export async function resolveProxyRateLimiter(
  env: Record<string, string | undefined> = process.env,
  config: RateLimiterConfig = {},
): Promise<ProxyRateLimit | undefined> {
  const creds = hasUpstashCreds(env);
  if (!creds) return undefined;
  const salt = resolveSalt(env);
  if (!salt) return undefined;

  // Dynamic import keeps the SDK out of dev/test bundles when Upstash
  // is not configured — matches the pattern in license/storage-upstash.ts.
  const { Redis } = await import("@upstash/redis");
  const client = new Redis({ url: creds.url, token: creds.token });

  const limiter = new UpstashRateLimiter(client, {
    limit: config.limit ?? DEFAULT_LIMIT,
    windowSec: config.windowSec ?? DEFAULT_WINDOW_SEC,
  });

  return {
    limiter,
    clientIdFor: (req) => hashClientId(req, salt),
  };
}

/** Label form for module-load logging in api/feed.ts and api/page.ts. */
export function describeRateLimiterMode(
  env: Record<string, string | undefined> = process.env,
): "upstash" | "off" {
  if (!hasUpstashCreds(env)) return "off";
  if (!resolveSalt(env)) return "off";
  return "upstash";
}
