# ADR 008: Upstash as the Single Production Data Layer

## Status
Accepted (2026-05-14). Supersedes the Vercel Blob portion of ADR 006.

## Context

By mid-May 2026 FeedZero had four distinct server-side storage needs:

1. **Encrypted vault sync** — store an encrypted blob per device cohort, keyed by `vaultId` (HMAC of passphrase).
2. **License records** — persist issued licenses (keyId → record) plus a revocation deny-list.
3. **Stripe event-id dedup** — remember which webhook event IDs we have already processed, so retries are idempotent.
4. **Anonymous feed catalog** — track per-feed proxy request counts for the public stats page.
5. **Proxy rate-limit counters** — per-client sliding-window counter with TTL.

The original PR-W deploy used three different backends concurrently: Vercel Blob for sync, Upstash KV for license + event store, and an in-memory `Map` for the catalog. This is what caused both production incidents documented in `docs/incidents/`:

- The **2026-05-12 sync regression** was rooted in operator config drift on the Vercel Blob integration — a stale `SYNC_STORAGE` env var routed every PUT to the filesystem adapter (which can't `mkdir` in Vercel's read-only function FS), 14 hours to diagnose.
- The **2026-05-14 stats-always-zero** bug came from the in-memory catalog adapter living in `src/core/catalog/adapters/memory-adapter.ts`. Each Vercel Lambda cold-start gets a fresh empty `Map`; the proxy lambda and the stats lambda never shared memory. The catalog had been silently non-functional since v0.3.0 (six weeks).

Two production-down classes of bug, one architectural shape: **multiple production storage backends increase operator surface area and create silent-fail modes that unit tests cannot see**.

## Decision

Consolidate all five storage needs onto a single Upstash REST KV instance. Each concern owns a disjoint keyspace prefix.

### Keyspace map

| Prefix | Module | Adapter | Notes |
|---|---|---|---|
| `license:record:<keyId>` | `src/core/license/storage-upstash.ts` | `UpstashLicenseStorage` | JSON record. |
| `license:revoked:<keyId>` | same | same | Reason string. Presence = revoked. Write-only (no unrevoke). |
| `customer:<customerId>:keys` | same | same | Redis SET of keyIds. Enables O(records-per-customer) `listByCustomer`. |
| `vault:<vaultId>` | `src/core/sync/adapters/upstash-adapter.ts` | `UpstashSyncAdapter` | Already-JSON-stringified `{ok, vault}` payload. Auto-deserialization OFF on the client. |
| `seen-event:<eventId>` | `src/core/stripe/seen-event-store.ts` | `UpstashSeenEventStore` | TTL = Stripe's 3-day retry window. |
| `catalog:feed:<url>` | `src/core/catalog/adapters/upstash-adapter.ts` | `UpstashCatalogAdapter` | JSON metadata record, created once with `SET NX`. **No TTL**: one key per unique feed URL ever fetched. |
| `catalog:ranking` | same | same | Redis sorted set. Score = request count, bumped with `ZINCRBY`; the only source of `requestCount`. Enables O(log N) inserts + O(top-K) reads for `popular()`. |
| `ratelimit:cli_<hash>` | `src/core/proxy/rate-limiter.ts` | `UpstashRateLimiter` | Counter. TTL = window length (default 60s). Auto-expires. |

The prefixes are structurally non-overlapping. `vaultId` is 64-hex, no colons; `customerId` and `keyId` always begin with a recognizable substring; rate-limit keys carry the `cli_` prefix. No two writers can ever conflict.

### Credential cascade (shared by all adapters)

Each adapter's resolver checks env vars in this order:

1. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (canonical names).
2. `KV_REST_API_URL` + `KV_REST_API_TOKEN` (legacy Vercel KV names, what the Vercel Marketplace Upstash integration auto-injects).
3. Otherwise → memory fallback for dev/test/self-host **with a loud module-load log**. Memory in production is treated as a configuration error worth alerting on.

The cascade is implemented as `hasUpstashCredentials(env)` exported from `storage-upstash.ts` and reused by every adapter (`hasUpstashSyncCredentials`, `hasUpstashCatalogCredentials`). They share the same predicate so an operator who configures once gets all five backends.

### `automaticDeserialization: false` for sync

The sync adapter constructs the Redis client with `automaticDeserialization: false` — the SDK's default auto-parses JSON-shaped strings into objects on GET, which broke our PUT-string-then-GET-string round trip (every cloud-pull returned the literal `"[object Object]"` for 24h before the smoke test caught it). The license and catalog adapters keep auto-deserialization on because they store objects natively; sync stores pre-serialized strings.

### Rate-limit auto-cleanup

Two keyspaces grow under organic traffic. The rate-limit keyspace gets one key per unique IP+UA hash per window, but each key carries a TTL = the window length, so it is bounded by `unique_clients_in_last_window` and needs no GC. The catalog keyspace has **no TTL**: every unique feed URL that ever returns a 2xx through `/api/feed` leaves a `catalog:feed:<url>` key and a `catalog:ranking` member forever. It grows with the number of distinct feeds, not with traffic, and nothing collects it today.

## Why a single backend

- **One integration to keep healthy.** The 2026-05-12 incident's root cause was Vercel Blob's "Needs Attention" flag silently disabling the integration. With one backend there's one set of integration status flags to watch.
- **Smaller operator surface.** Five storage modules sharing one client constructor pattern (`UpstashClient` interface + dynamic import of `@upstash/redis`) is easier to operate than five different SDKs.
- **Command budget.** Upstash bills per command, and the per-fetch paths dominate: every `/api/feed` request runs the rate limiter, and every 2xx upstream answer records a catalog hit. The original estimate here ("well within 10K commands/day") assumed the catalog upsert was cheap; it was 3 commands (GET + SET + ZADD) per fetch, and with every client refreshing every subscribed feed every 30 minutes that exhausted the paid plan in 2026-10. The catalog upsert is now 2 commands (`SET NX` + `ZINCRBY`), and 304 Not Modified / other 3xx answers record nothing. Budget as roughly `2 × 2xx_fetches + rate_limit_commands × proxy_requests` per day, and watch the Upstash usage graph rather than trusting this estimate.
- **Same anonymity floor.** All five concerns already needed to be PII-free; co-locating them doesn't change that. Vault payloads are client-encrypted blobs; license records contain only `keyId` (random) + `customerId` (Stripe-scoped opaque) + tier; rate-limit hashes are salted SHA-256 of IP+UA.

## Alternatives rejected

### Keep Vercel Blob for sync, Upstash for the rest
This was the state immediately after PR U (license storage). It's what PR #45 supersedes. The 2026-05-12 incident is the case study against it.

### Use a single relational database (Neon / Supabase Postgres)
Better for analytical queries but overkill for our access pattern (key-value lookups + one sorted set + counters). Adds connection-pool complexity that Upstash REST avoids entirely.

### Self-hosted Redis
Doesn't match the Vercel-only production deployment model. Self-hosters already get the in-memory fallback for dev / `npm run serve` use cases.

## Consequences

- **`SyncStorageAdapter` interface** (in `src/core/sync/types.ts`) is preserved — Upstash is just another implementation, alongside `filesystem` (self-host) and `memory` (test). Self-hosters who don't use Upstash continue to work via filesystem.
- **`resolveAdapter` cascade** prefers Upstash over Vercel Blob when both env-var pairs are present. Blob remains reachable via explicit `SYNC_STORAGE=vercel-blob` for rollback.
- **Memory adapters are test fixtures, not production fallbacks.** Per ADR 011's smoke-test discipline and the post-mortems below, the module-load log line surfaces "memory" mode as a regression signal. Eventually we'll move them to `src/test-utils/` and have the resolvers refuse them in `NODE_ENV=production`.
- **Single point of failure.** If Upstash has an incident, five subsystems degrade simultaneously. Mitigated by: (a) license + sync degrade gracefully (cached locally on the client), (b) rate limiter fails open (per ADR 010), (c) catalog is a stats display that can show stale data, (d) Stripe event dedup falls back to the issuer's per-subscription idempotency.

## References

- PR #45 (Upstash sync adapter + cascade preferring Upstash over Blob)
- PR #47 (persistent Upstash-backed feed catalog)
- PR #48 (Upstash rate limiter)
- PR #49 (sync auto-deserialization fix discovered by smoke test)
- `docs/incidents/2026-05-12-sync-regression.md`
- `docs/incidents/2026-05-14-stats-always-zero.md`
- ADR 011 (Smoke tests in RGR+S — the workflow change that catches this class of bug going forward)
