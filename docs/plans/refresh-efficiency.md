# Plan: Refresh efficiency + configurable interval

## Goal

Two threads, both surfaced by issue #117:

1. **Configurable refresh interval** — let users set how often auto-refresh runs (5 min / 30 min / 1 h / 6 h / daily / never). Currently hardcoded to `AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000`.
2. **Cut per-refresh cost** — every tick of `refreshAll()` does more work than it needs to. Self-hosted users on a 100 req/min/IP budget feel this first (sporadic `/api/sync` 429s during refresh storms), but every user pays in bandwidth, decrypt cost, and encrypted-vault write churn.

## What `refreshAll()` does today (every 30 min)

`src/stores/feed-store.ts:548-570`. Per tick:

1. `retryFailedFavicons()` — bumps the favicon-cache generation counter. Subscribers now no-op when their strategy index hasn't changed (post #117 fix), so this is cheap. ✅
2. If sync user: `syncStore.pull()` — **unconditional** full vault GET, decrypt, merge. No `If-Modified-Since` / `ETag` / vault-version short-circuit.
3. `reloadFeeds(set)` — full IndexedDB read of `feeds` + `folders`, decrypt every row, rebuild in-memory list.
4. `refreshAllFeeds()` — fans out one `/api/feed` request per feed. **No conditional GET** (`proxyFetch` doesn't send / forward `If-None-Match` / `If-Modified-Since`; the proxy doesn't honor 304s). Every feed re-downloads its full XML body every tick even when unchanged.
5. `reloadFeeds(set)` — again (same full read).
6. `schedulePush()` — debounced 5 s sync push. The vault gets re-encrypted and PUT even if the only changes were freshness timestamps (`lastFetchedAt` / `lastSuccessfulFetchAt`) with no user-meaningful edits.
7. `void schedulePrefetch(get().feeds)` — fire-and-forget full-text extraction for prefetch-enabled feeds.

For a sync user with 60 feeds: 1 vault GET + 60 feed proxy requests + 1 vault PUT, every 30 min. The sync GET/PUT each carry the full multi-KB encrypted vault. The 60 feed fetches re-download bodies the publisher could have told us are unchanged.

## Inefficiency findings (ranked by impact / cost)

### A — No conditional GET on feed fetch *(biggest win, medium effort)*
The proxy at `/api/feed` (`src/core/proxy/proxy-handler.ts`) doesn't forward `If-None-Match` / `If-Modified-Since` headers from the client, and `refreshFeed` (`src/core/feeds/feed-service.ts:356`) doesn't supply them. Adding per-feed `etag` + `lastModified` columns + forwarding the conditional headers turns most refreshes into 304s for publishers that support it (most major sites do). Bandwidth and parse cost go to near-zero on unchanged feeds.

### B — Unconditional vault pull *(big win for sync users, small effort)*
`/api/sync` already supports `HEAD` (returns vault metadata). A `pull()` that first `HEAD`s and only `GET`s when the vault's `updatedAt` is newer than `lastPullAt` skips the body 99% of the time when the user is on one device. The `HEAD` is a few bytes.

### C — Push only when user-meaningful state actually changed *(medium win, larger effort)*
`schedulePush()` fires whenever feed rows are touched, and freshness timestamps count as a touch. Splitting `Feed` into "synced shape" (url/title/folderId/prefs/rules) vs "device-local freshness" (lastFetchedAt/lastSuccessfulFetchAt/lastError) means a refresh that only changes freshness doesn't push. The two halves can stay in the same table; we just exclude the freshness fields from the vault payload and re-derive them locally on pull. Needs an ADR — back-compat with v3 vaults is fiddly.

### D — `reloadFeeds` runs twice per refresh *(small win, trivial effort)*
Two full IndexedDB reads of feeds+folders per tick. The first (after `pull`) is needed because the merge may have changed rows; the second (after `refreshAllFeeds`) only needs the freshness columns. Could collapse to one read if (C) lands, or update in-memory rows from the refresh result directly.

### E — Fan-out backpressure *(small win, small effort)*
60 concurrent `/api/feed` requests hit a self-hosted server that allows 100/min. Already grouped by host in `refreshAllFeeds` (`src/core/feeds/group-by-host.ts`) but not throttled per-process. A small concurrency cap (e.g. 8 in-flight) keeps the user's other API calls (sync, favicon, paywall) within budget. Pairs well with (A) since 304s are cheap once we have them.

### F — Cross-device coordination *(speculative, low priority)*
Two devices each running their own 30 min timer means the vault PUT/GET pair fires up to 2 × per window. A vault-side `lastRefreshAllAt` device hint lets the second device skip its scheduled refresh if another device pushed recently. Probably not worth it until we see real-user reports.

## Step 1 (this plan's first PR) — Configurable interval

Smallest unit of progress and the thing DoubtfulYeti592 asked for.

- Add `refreshIntervalMinutes: number` to `UserPreferences` (`src/types/index.ts`). Allowed values from a `REFRESH_INTERVAL_OPTIONS` const: `[5, 15, 30, 60, 360, 1440, 0]` where `0` = manual only.
- Default = 30 (current behavior).
- `use-auto-refresh.ts` reads from `usePreferencesStore` and resubscribes the interval when the preference changes.
- Settings → Reading: a Select component listing the options ("Every 5 minutes", …, "Every day", "Manual only").
- License gate: keep on the free tier (it's an *opt out* of polling — privacy-positive, no reason to paywall it).
- Tests: store hydration → hook uses new interval; setting to 0 disables the timer; focus-when-stale still works using the configured threshold.

## Step 2+ (follow-up PRs)

Land (A), then (B), in that order. (C) needs an ADR before code. (D) and (E) ride along with whichever PR is next in the same files.

## Out of scope

- Per-feed refresh intervals. Possible later but multiplies UI complexity and isn't asked for.
- WebPush / background-sync API. Wrong privacy trade-off (third-party push service).
- Active feed prioritization (read-often feeds refresh more frequently). Interesting but speculative; revisit after (A)+(B) ship and we see real-world refresh-cost data.

## Owner

Unassigned. Issue #117 thread is the breadcrumb.
