# Feature 015: Starred articles + offline prefetch

## Status
Implemented

## Summary

Users can star (save-for-later) any article. For Personal-tier users, the
background prefetch service automatically fetches and persists the full
text of every starred article so the article is available offline and
travels through the encrypted vault to every other device the user is
signed into.

This is the first Personal-tier feature that materially improves the
*reading loop* (rather than data topology like sync or auto-organize). It
closes the gap named in [`docs/strategy/003-playing-to-win.md`](../strategy/003-playing-to-win.md)
§4: *"Background pre-fetch for starred / frequently-read feeds (lire's
distinctive feature; rated #1 for offline)."*

The split between the free primitive (star) and the gated background
work (prefetch) follows the existing model: `cloud-sync` is the gated
feature; the underlying article store is free. Anyone can save articles
locally; only Personal users get the cross-device, offline-ready
extracted full text.

## Behaviour

```gherkin
Feature: Starred articles with background prefetch

  Scenario: A free user stars an article
    Given a user on the free tier is viewing an article
    When they click the star button (or press "s")
    Then the article is flagged starred locally
    And a "Starred" entry appears in the sidebar
    And the article is listed under /feeds/starred sorted by star time
    And no network request is made to the page proxy

  Scenario: A Personal-tier user stars an article
    Given a Personal-tier user is viewing an article
    When they click the star button (or press "s")
    Then the article is flagged starred locally
    And the next feed refresh triggers a background full-text prefetch
    And after the prefetch completes the article carries extractedContent
    And the encrypted vault push delivers the new state to other devices

  Scenario: Reader picks the persisted extracted content first
    Given an article has both Article.extractedContent and an in-memory
      on-demand cache entry
    When the reader renders the "Full text" view
    Then the persisted extractedContent is shown
    And the in-memory cache is only consulted when no persisted content
      exists

  Scenario: Prefetch respects the gate
    Given a free user with the paid tier active
    When refreshAll completes
    Then prefetchStarredArticles is NOT called
    And no /api/page requests are issued for starred articles

  Scenario: Prefetch is idempotent
    Given a starred article already has extractedContent
    When prefetchStarredArticles runs
    Then the article is skipped — no fetch, no update
```

## Architecture

### Flow

1. User clicks the star button in the reader or article list (or presses `s`).
2. `useArticleStore.toggleStar(articleId)` flips `Article.starred`,
   stamps `starredAt`, calls `updateArticle()` to encrypt-and-persist,
   then calls `useSyncStore.scheduleSyncPush()`.
3. The "Starred" sidebar entry becomes visible (gated on `articlesByFeedId`
   containing at least one starred article). Selecting it navigates to
   `/feeds/starred`.
4. `useArticleStore.loadArticles(STARRED_FEED_ID)` flat-maps every
   starred article across feeds and sorts by `starredAt` desc.
5. On the next `refreshAll()` (manual or automatic), the feed-store
   checks the `offline-prefetch` gate and, if open, fires
   `prefetchStarredArticles()` in the background.
6. `prefetchStarredArticles()`:
   - reads every article via `getAllArticles()`
   - filters: `starred && !extractedContent && fetchable link && younger than 90d`
   - runs a 3-worker pool: `proxyFetch("/api/page", link)` → `extract()` → `updateArticle()`
   - each successful extraction persists `extractedContent` + `extractedAt`
7. After the batch settles, `useArticleStore.preloadAll()` refreshes the
   in-memory article cache so the UI picks up the new content without a
   manual reload.
8. The debounced sync push (`scheduleSyncPush`, 5s + 0–30s jitter)
   collapses every persisted prefetch into a single encrypted vault
   PUT — other devices pull on next refresh and inherit the same
   `extractedContent`.

### Files

| File | Role |
|------|------|
| `src/types/index.ts` | `Article.starred`, `starredAt`, `extractedContent`, `extractedAt` — all optional |
| `src/utils/constants.ts` | `STARRED_FEED_ID`, `isStarredFeedId`, `isAggregatedFeedId` |
| `src/stores/article-store.ts` | `toggleStar` action, starred-view derivation + sort |
| `src/stores/feed-store.ts` | `schedulePrefetch` hooks into `refreshAll` completion |
| `src/core/extractor/prefetch-service.ts` | Orchestrator: candidate selection, worker pool, persistence |
| `src/lib/pick-extracted-content.ts` | Precedence helper — persisted beats in-memory cache |
| `src/components/articles/article-item.tsx` | Inline star indicator on list rows |
| `src/components/reader/reader-panel.tsx` | Star button in the reader header |
| `src/components/layout/sidebar-body.tsx` | "Starred" sidebar entry (visible once first star exists) |
| `src/components/layout/header-breadcrumbs.tsx` | Breadcrumb labels for STARRED + ALL virtual feeds |
| `src/components/layout/mobile-nav-drawer.tsx` | Mobile drawer handle label honours STARRED_FEED_ID |
| `src/hooks/use-keyboard-nav.ts` | `s` keyboard binding |
| `src/core/features/feature-gates.ts` | `"offline-prefetch"` Personal-tier shipped entry |

### Tests

| File | Coverage |
|------|----------|
| `tests/utils/starred-constants.test.ts` | STARRED_FEED_ID, isStarredFeedId, isAggregatedFeedId |
| `tests/core/features/offline-prefetch.test.ts` | Gate matrix coverage for the new feature |
| `tests/core/sync/starred-vault-roundtrip.test.ts` | New optional Article fields encrypt → decrypt cleanly; legacy vaults still round-trip |
| `tests/stores/article-store.test.ts` | `toggleStar`, starred-view sorting, cross-feed selection |
| `tests/stores/feed-store.test.ts` | `schedulePrefetch` honors the gate |
| `tests/core/extractor/prefetch-service.test.ts` | Selection, persistence, idempotence, age cutoff, link guard, concurrency cap, failure isolation |
| `tests/lib/pick-extracted-content.test.ts` | Precedence: persisted > in-memory > undefined |
| `tests/integration/keyboard-ui-parity.test.tsx` | `s` key parity with the star button |
| `tests/components/layout/sidebar-starred.test.tsx` | Entry hidden until first star; navigates via STARRED_FEED_ID |

## Design Decisions

- **Star is a free primitive, prefetch is gated.** Pocket refugees expect
  save-for-later as a baseline. Paywalling the *act* of starring would
  contradict the migration acquisition story (`docs/strategy/003-playing-to-win.md`
  §2). What's gated is the cross-device, offline-ready full-text — the
  bandwidth-and-storage value-add.
- **Additive schema, no Dexie migration.** Dexie stores articles as
  opaque encrypted blobs (`{id, iv, ciphertext, [hashed indexes]}`). New
  optional fields ride inside the encrypted payload; old records decrypt
  to `Article` with the new fields `undefined`. This was verified end-
  to-end in `tests/core/sync/starred-vault-roundtrip.test.ts` (legacy
  round-trip + new-field round-trip).
- **Persisted content beats in-memory cache.** When both are present,
  the reader uses `Article.extractedContent`. Persisted content survives
  reload, syncs across devices, and is the canonical source — the in-
  memory cache exists only to make the on-demand "Full text" click feel
  instant. Treating `extractedContent === ""` as "missing" lets a future
  retry overlay it from the on-demand path.
- **Fire-and-forget prefetch with debounced sync push.** Awaiting the
  prefetch would block the refresh spinner for several seconds on a
  fresh load. Firing it asynchronously and relying on the existing
  5s-debounced `scheduleSyncPush` means the user sees fresh articles
  immediately and a single vault push covers a whole batch of extracted
  content.
- **Worker-pool concurrency cap (3).** Same cap as `REFRESH_CONCURRENCY`
  in `feed-service.ts` — publisher etiquette, matches what the rest of
  the codebase already does.
- **90-day age cutoff.** Power users may have years of pre-existing
  saves. Blasting hundreds of `/api/page` requests at publishers on
  first run would be antisocial and slow. 90 days is the cutoff for
  "likely to revisit".
- **Sidebar entry hidden until first star.** Empty-state clutter is a
  worse onboarding experience than discoverability lost from a hidden
  link. The article-store buckets are the source of truth, so the entry
  flips on the moment `toggleStar` runs — no separate flag to maintain.
- **No-auto-destroy invariant preserved.** Prefetch only ever calls
  `updateArticle()` (additive). It never invokes any of the sanctioned
  destroy paths.

## Limitations

- **Vault size budget not enforced.** With heavy stars + large
  extracted articles, the encrypted vault could grow past the documented
  5 MB cap (`SYNC.MAX_VAULT_SIZE`). Today's users won't hit this — the
  first vault to land over the limit will produce a clear error message
  via the existing sync handler. Defer the enforcement (per-article
  byte cap? rolling truncation?) until we observe a real user case.
- **No proactive "smart" prefetch.** Frequently-read feeds and unread
  articles are NOT prefetched — only explicit stars. Adding heuristics
  is on the roadmap but the explicit signal is cheaper to reason about
  for v1.
- **No service-worker runtime caching.** IndexedDB already gives us the
  offline guarantee; SW complexity isn't paying for itself yet. Offline
  reading works because `Article.extractedContent` is in IndexedDB and
  the app shell is cached by the existing service worker.
- **No "downloaded" pip on the star icon yet.** A future polish pass
  could differentiate "starred (not yet prefetched)" from "starred
  (offline-ready)". Today both states render the same amber star.
