# Plan: Persistent Feed Stats via Vercel KV

## Goal

Make `GET /api/stats/feeds` work on Vercel by replacing the in-memory feed cache stats with persistent Redis counters via Vercel KV.

## Why

The current feed cache (`src/core/proxy/feed-cache.ts`) tracks anonymous per-URL request counts in memory. This works on the self-hosted Hono server but not on Vercel, where each serverless invocation starts fresh. We need a persistent, atomic counter store.

## Approach: Vercel KV (Redis sorted set)

Use a Redis sorted set (`feed-requests`) where each member is a feed URL and the score is the request count. `ZINCRBY` is atomic — no race conditions under concurrent requests.

## Steps

### 1. Add Vercel KV add-on and package

- Enable Vercel KV in the Vercel dashboard (Settings → Storage → Add → KV)
- This provisions a Redis instance and sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars automatically
- Install the package:
  ```bash
  npm install @vercel/kv
  ```
- Add `"@vercel/kv"` to the `external` array in `scripts/build-api.js` (same pattern as `@vercel/blob`)

### 2. Create a feed stats adapter (`src/core/proxy/feed-stats-adapter.ts`)

Pluggable adapter interface (same pattern as `SyncStorageAdapter`):

```ts
interface FeedStatsAdapter {
  recordRequest(url: string): Promise<void>;
  getTopFeeds(limit?: number): Promise<{ url: string; requests: number }[]>;
}
```

Two implementations:
- **Memory adapter** — wraps the existing in-memory `Map<string, FeedStats>` from `feed-cache.ts`. Used by Hono server and dev.
- **Vercel KV adapter** — uses `@vercel/kv`:
  ```ts
  import { kv } from "@vercel/kv";

  async function recordRequest(url: string) {
    await kv.zincrby("feed-requests", 1, url);
  }

  async function getTopFeeds(limit = 50) {
    const results = await kv.zrange("feed-requests", 0, limit - 1, {
      rev: true,
      withScores: true,
    });
    // results is [member, score, member, score, ...]
    // Parse into { url, requests } pairs
  }
  ```

### 3. Wire into proxy handler

In `src/core/proxy/proxy-handler.ts`, accept an optional `FeedStatsAdapter`:
- Call `adapter.recordRequest(url)` on every proxied feed request (fire-and-forget, don't block the response)
- The in-memory cache (TTL, response caching) stays as-is — it's separate from stats persistence

### 4. Create Vercel serverless function `api/stats-feeds.ts`

Thin wrapper (same pattern as `api/stats-sync.ts`):

```ts
import { createVercelKvFeedStatsAdapter } from "../src/core/proxy/feed-stats-adapter.ts";

const adapter = createVercelKvFeedStatsAdapter();

export async function GET(req: Request): Promise<Response> {
  const feeds = await adapter.getTopFeeds();
  return new Response(JSON.stringify({ feeds }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

### 5. Update Hono server + vite config

- `server.ts`: pass memory feed stats adapter, update `/api/stats/feeds` → `/api/stats-feeds`
- `vite.config.js`: add `/api/stats-feeds` middleware

### 6. Update the feed proxy Vercel functions (`api/feed.ts`, `api/page.ts`)

These need to call `adapter.recordRequest(url)` before returning. Import and instantiate the KV adapter.

### 7. Three-entry-point rule

All three entry points must be updated:
- [x] `api/stats-feeds.ts` — new Vercel function
- [x] `server.ts` — Hono route
- [x] `vite.config.js` — dev middleware

### 8. Tests (RGR)

- **Unit tests** for the memory adapter (extract from existing `feed-cache.test.ts`)
- **Unit tests** for the KV adapter (mock `@vercel/kv`)
- **Contract test** in `server.test.ts` for the new endpoint
- **Routing contract test** ensuring `api/stats-feeds.ts` exports `GET`

### 9. URL alignment

Rename the Hono route from `/api/stats/feeds` to `/api/stats-feeds` to match the Vercel file path (same fix we just did for `stats-sync`).

## Privacy

This is already privacy-safe by design (see `feed-cache.ts` header comments):
- No user identity attached to counters
- No session correlation
- No request grouping — cannot determine which feeds a single user reads
- Only stores: feed URL → total request count

## Out of scope

- Feed response caching on Vercel (the TTL cache remains in-memory and per-invocation — acceptable since Vercel functions are fast and short-lived)
- Rate limiting the stats endpoint (can add later if needed)
