/**
 * Per-client rate limiter for the production feed proxy.
 *
 * Architecture:
 *  - Identify the client by hashing IP + User-Agent + project salt.
 *    Raw IPs never leave the lambda's request context.
 *  - Maintain a counter in Upstash KV keyed on the hash with a TTL window.
 *    INCR returns the new count atomically; the first hit also EXPIRE-s
 *    the key so the counter auto-resets at window boundary.
 *  - Returns `{ allowed, retryAfterSec? }` per request — caller decides
 *    whether to short-circuit with 429.
 *
 * Anonymity floor:
 *  - The persisted key is `ratelimit:cli_<8-hex-chars>`. The hash uses
 *    SHA-256 of `${ip}|${ua}|${salt}` — without the salt the hash is
 *    still reversible via rainbow attack on common UAs, so the salt is
 *    load-bearing for privacy. Rotating the salt invalidates all buckets
 *    (useful for emergency reset).
 *  - We DON'T log raw IPs anywhere. The `cli_xxxx` prefix matches the
 *    `req_xxxx` shape from PR #43 so an operator can grep both.
 *
 * Why fail-open on Upstash errors: a rate limiter that takes the whole
 * proxy down when storage hiccups is worse than no rate limiter. We log
 * the failure and let the request through.
 */

/**
 * Minimal subset of the Upstash Redis client the rate limiter needs.
 * Defined inline so tests pass a fake without pulling in `@upstash/redis`.
 */
export interface UpstashRateLimitClient {
  /** Atomic increment. Returns the new value. */
  incr(key: string): Promise<number>;
  /** Set TTL on a key in seconds. Returns 1 if set, 0 if key missing. */
  expire(key: string, sec: number): Promise<number>;
  /** Time-to-live in seconds. -1 = no TTL, -2 = key missing. */
  ttl(key: string): Promise<number>;
}

export interface RateLimitConfig {
  /** Max requests per client per window. Default: 300. */
  limit: number;
  /** Window length in seconds. Default: 60. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only populated when allowed=false. */
  retryAfterSec?: number;
}

const KEY_PREFIX = "ratelimit:";

export class UpstashRateLimiter {
  constructor(
    private readonly client: UpstashRateLimitClient,
    private readonly config: RateLimitConfig,
  ) {}

  async check(clientId: string): Promise<RateLimitResult> {
    const key = KEY_PREFIX + clientId;
    try {
      const count = await this.client.incr(key);
      // First hit in a new window — set the TTL so the counter auto-resets.
      // Subsequent hits skip EXPIRE so the window doesn't slide forward
      // (which would allow a steady-rate attacker to evade limits).
      if (count === 1) {
        await this.client.expire(key, this.config.windowSec);
      }
      if (count > this.config.limit) {
        const ttl = await this.client.ttl(key);
        // ttl can be -1 (no expiry — shouldn't happen) or -2 (missing — race
        // condition between INCR and TTL). Treat both as "use the full
        // window" to avoid returning 0 retry-after.
        const retryAfterSec = ttl > 0 ? ttl : this.config.windowSec;
        return { allowed: false, retryAfterSec };
      }
      return { allowed: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Fail OPEN — log and allow. See file header for rationale.
      console.error(
        JSON.stringify({
          route: "rate-limiter",
          errClass: "UpstashRateLimitError",
          errMsg: message,
          ts: new Date().toISOString(),
        }),
      );
      return { allowed: true };
    }
  }
}

/**
 * Derive a stable, opaque client identifier from a Request. Hashes
 * IP + User-Agent + salt with SHA-256 and returns `cli_<8-hex-chars>`.
 *
 * The 8 hex chars give 4 billion possibilities — collisions across a year
 * of traffic are negligible, and even a collision is harmless (worst case:
 * two clients share a rate-limit bucket, slightly tighter than intended).
 */
export async function hashClientId(
  request: Request,
  salt: string,
): Promise<string> {
  const ip = extractClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const input = `${ip}|${ua}|${salt}`;

  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(input),
  );
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return "cli_" + hex;
}

/**
 * Extract the client IP from common forwarding headers. Returns "unknown"
 * if no header is present (defensive — Vercel always sets x-forwarded-for
 * in practice, but we don't want a crash).
 *
 * x-forwarded-for can be a comma-separated chain ("client, proxy1, proxy2").
 * The FIRST entry is the original client; subsequent entries are
 * infrastructure proxies and shouldn't change the client identity.
 */
function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
