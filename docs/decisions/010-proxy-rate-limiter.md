# ADR 010: Proxy Rate Limiter — Hashed Per-Client, Upstash-backed, Fail-Open

## Status
Accepted (2026-05-14).

## Context

`api/feed.ts` and `api/page.ts` are the two production proxies that fetch external URLs on behalf of users. Until PR #48 neither had any rate limiting. The `createRateLimiter()` helper in `server.ts` was reachable only via the self-hosted Hono path; the Vercel Lambda entry points skipped it entirely.

The risk model:

- **Cost.** Each proxy fetch is one outbound HTTP request + one Upstash write (catalog upsert) + (after this ADR) one Upstash INCR (rate-limit counter). A single client hammering the proxy can rack up Upstash commands toward the free-tier limit, plus outbound egress.
- **Abuse target.** The proxy will fetch any user-supplied URL (within SSRF rules). Without rate limits, the proxy is a free anonymous-fetch service.
- **Detection.** The catalog only aggregates per-feed; it can't surface per-client patterns. So we couldn't *detect* per-user abuse from the data either — the same fix that adds enforcement is the only signal we have for "is anyone hammering us".

Anonymity floor (per ADR 009): the limiter cannot log or persist raw IPs, User-Agents, or anything else that identifies the client.

## Decision

### Identification: salted hash of IP + UA

```ts
// src/core/proxy/rate-limiter.ts
async function hashClientId(req: Request, salt: string): Promise<string> {
  const ip = extractClientIp(req);                  // x-forwarded-for first hop
  const ua = req.headers.get("user-agent") ?? "";
  // SHA-256 of `${ip}|${ua}|${salt}`, first 4 bytes hex-encoded.
  return "cli_" + sha256First8Hex(`${ip}|${ua}|${salt}`);
}
```

- **IP + UA pair** so multiple users behind a single NAT (corporate offices, mobile CGNAT) don't all share one rate-limit bucket.
- **Salt** makes the hash non-rainbow-attackable on common IP+UA pairs. Salt source: `RATE_LIMIT_HASH_SALT` env var, fall back to `LICENSE_SIGNING_KEY` (already required in production, high entropy, already secret-scoped in Vercel). **Fail-closed on missing salt** — the resolver returns `undefined` (no rate limiting at all) rather than persist rainbow-attackable hashes.
- **`cli_` prefix** mirrors PR #43's `req_` traceId shape. Operators can grep both styles in one query.
- 8 hex chars = ~4 billion possibilities. Collisions across our scale of traffic are negligible and harmless (two clients sharing a bucket = slightly tighter than intended).

### Storage: Upstash KV counter with TTL

```
Key:   ratelimit:cli_<8-hex>
Op:    INCR; on first hit (count === 1) also EXPIRE = windowSec
Limit: 300 requests per 60-second window (configurable)
```

- **INCR is atomic** at the Redis layer — no read-modify-write race.
- **EXPIRE only on first hit.** If we re-set TTL on every hit, the window slides forward forever and a steady-rate attacker never gets throttled. Unit test pins this invariant.
- **Counter auto-expires** at window end. No GC job needed.
- **`429` with `Retry-After`** (RFC 6585 §4 compliance). Body carries `{ok:false, error:"rate limit exceeded", traceId}` — no client identifier echoed back.

### Cascade: opt-in, fail-open

The rate limit option on `ProxyOptions` is `rateLimit?:` (optional). When `undefined` (self-host, dev, missing Upstash creds, missing salt) the proxy skips the check entirely. Backwards compatible with every non-Vercel deployment.

When Upstash itself errors, the limiter **fails open** — logs the error via the structured logger from ADR 009 and allows the request. A limiter that takes the proxy down when storage hiccups is worse than no limiter. Unit test pins this.

### Defaults: 300/min

Chosen to accommodate a power user's "refresh all" on a 200-feed folder (which fires ~200 simultaneous proxy requests) without false-positive 429s, while still blocking sustained 5+ req/sec abuse. Tunable per route via the resolver's options arg.

### Check fires BEFORE URL validation

The limiter runs at the very start of `handleProxyRequest`, before the SSRF check. Rationale: an attacker spraying invalid URLs should still consume their bucket. Otherwise they can probe the proxy unbounded. Unit test pins this.

## Why salted SHA-256 (not a separate identity service)

- The salt + project-scoping is enough to defeat rainbow-table reversal for our threat model (we're not Cloudflare; we're a small RSS reader).
- Rotating `RATE_LIMIT_HASH_SALT` invalidates all buckets — useful as an emergency reset without code changes.
- No new persistent state beyond the 60-second TTL counters. Nothing to leak, nothing to maintain.

## Why opt-in (not always-on)

Self-hosters running `npm run serve` (Hono) shouldn't need Upstash to operate. The existing in-memory `createRateLimiter()` in `server.ts` already handles their case. Forcing Upstash on self-hosters is a vendor-lock-in we don't need.

## Anonymity floor

Persisted state: `ratelimit:cli_<8-hex>` → integer. No raw IPs, no UAs, no input correlation across the salt boundary. Counters auto-expire. The only persistent signal is "how many distinct cli_ hashes have hit the proxy in the last 60s" — a number a logged-out observer could approximate from public stats anyway.

Logging: a 429 emits the standard ADR 009 structured log line with `traceId`, no `cli_` value. The `cli_` hash is never logged — it's only used as a key in the counter store.

## Consequences

- The previous unanswerable ops question ("is anyone abusing the proxy?") now has a real ongoing answer: each 429 in Vercel runtime logs is one bucket exceeding the budget. Zero 429s/day = normal. Hundreds = active abuser. The smoke test in `tests/smoke/rate-limiter.test.ts` validates the 429 path against production on every deploy.
- A power-user with 300+ active feeds doing a "refresh all" might briefly hit 429s on the tail. Per the user's call (2026-05-14, see PR #48 thread), this is acceptable — they'd see "some feeds failed to refresh, retrying" briefly. If it becomes a real complaint we'll raise the limit.
- Tests have an additional structural invariant: `ProxyOptions.rateLimit` is opt-in. The check fires before URL validation. EXPIRE only on first hit. Fail-open on Upstash error. All four pinned by unit tests.

## Alternatives rejected

### Server-side rate limit by IP only (no UA)
Cleaner but blasts entire NATs out of the bucket simultaneously. Mobile carriers' CGNAT is the obvious case.

### Rate limit on the catalog count instead
Catalog counts per-feed, not per-client. Doesn't address the threat.

### Stricter limit (60 req/min)
Considered. Catches more abuse but 429s on legitimate folder refreshes of >60 feeds. Not worth the false-positive rate at our threat level.

### Per-route limits
Currently one global limit applies across `/api/feed` and `/api/page`. We could split them. Not yet justified — both endpoints are equally expensive.

### Cloudflare WAF or similar
Stronger but adds another vendor dependency and the privacy review surface (Cloudflare sees raw IPs). The hashed-counter approach is enough for our threat level.

## References

- PR #48 (Rate limiter + bake SMOKE into RGR)
- `src/core/proxy/rate-limiter.ts`, `src/core/proxy/resolve-rate-limiter.ts`
- `tests/core/proxy/rate-limiter.test.ts` — unit invariants
- `tests/smoke/rate-limiter.test.ts` — production verification
- ADR 008 (Upstash as the data layer this counter lives in)
- ADR 009 (the `traceId`/structured-log pattern the 429 path uses)
