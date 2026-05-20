# Feature 018: Prefetch Extensions

## Status
Implemented

## Summary

Extends the existing offline-prefetch (Feature 015) past just starred
articles. Now a user can:

1. **Opt a whole feed in** via a per-feed "Prefetch full text" toggle. Every refresh pre-extracts the feed's top-N most recent articles.
2. **Have it happen automatically** for feeds they actually read. A frequency heuristic (read >= 10 articles in the last 30 days) auto-prefetches without the explicit toggle.

The strategic anchor is `docs/strategy/003-playing-to-win.md § Capabilities`: lire is the rated #1 RSS reader for offline because it pre-fetches every article in the background; FeedZero already had Defuddle extraction but only ran it for starred articles. This commit lands the lire-class behaviour without changing the privacy posture — read counts and timestamps live exclusively in the encrypted vault.

## Behaviour

```gherkin
Feature: Per-feed and frequency-based prefetch

  Scenario: Explicit per-feed toggle
    Given I subscribe to "Tech Crunchies"
    When I open the feed's dropdown and click "Prefetch full text"
    Then Feed.prefetchEnabled becomes true
    And the next refreshAll pre-extracts up to FEED_PREFETCH_LIMIT (20) recent articles from that feed
    And the extracted content is encrypted at rest and syncs to other devices

  Scenario: Frequency heuristic
    Given I have read >= 10 articles from "Acoup" in the last 30 days
    When refreshAll runs
    Then Acoup is auto-prefetched (FEED_PREFETCH_LIMIT articles)
    Even though I have not flipped the per-feed toggle

  Scenario: Toggled + frequently-read does not double-prefetch
    Given I toggled "Tech Crunchies" AND I have read enough articles to satisfy the heuristic
    When refreshAll runs
    Then prefetchFeedArticles is called once for "Tech Crunchies"

  Scenario: Free tier user gets no prefetch
    Given I am on the Free tier with paid-tier launched
    When refreshAll runs
    Then neither the starred nor the per-feed/heuristic passes fire (gate-locked at offline-prefetch)

  Scenario: Prefetched articles are idempotent
    Given an article already has Article.extractedContent set
    When prefetchFeedArticles selects candidates
    Then that article is skipped (no re-fetch, no re-write)
```

## Architecture

### Flow

1. `refreshAll` finishes — feeds + articles are fresh.
2. `schedulePrefetch(feeds)` runs (fire-and-forget) after gate-check on `offline-prefetch`.
3. **Pass 1 (starred):** `prefetchStarredArticles` extracts starred articles missing `extractedContent` (unchanged behaviour from Feature 015).
4. **Pass 2 (per-feed):** Compose a Set of feed ids to prefetch:
   - feeds with `prefetchEnabled === true` (explicit toggle)
   - feeds returned by `selectFrequentFeeds(allArticles)` (heuristic)
5. For each feed id in the Set: `prefetchFeedArticles(id, FEED_PREFETCH_LIMIT)` extracts the N most recent articles missing `extractedContent`, respecting `PREFETCH_AGE_LIMIT_MS` (90 days) and `PREFETCH_CONCURRENCY` (3).
6. If any pass extracted content, the article-store reruns `preloadAll` so the cached articles surface in the UI without a manual refresh.

### Files

| File | Role |
|------|------|
| `src/types/index.ts` | `Feed.prefetchEnabled?`, `Article.readAt?` |
| `src/core/extractor/prefetch-service.ts` | `prefetchFeedArticles`, `selectFrequentFeeds`, `FREQUENCY_THRESHOLD`, `FREQUENCY_WINDOW_MS`, `FEED_PREFETCH_LIMIT` shared with `feed-store` |
| `src/stores/feed-store.ts` | `setFeedPrefetchEnabled` mutator; `schedulePrefetch(feeds)` composes the explicit + heuristic feed sets |
| `src/stores/article-store.ts` | `selectArticle` sets `readAt = Date.now()` on auto-mark-read |
| `src/components/sidebar/feed-item.tsx` | "Prefetch full text" dropdown entry |

### Tests

| File | Coverage |
|------|----------|
| `tests/stores/feed-store-prefetch-toggle.test.ts` | `setFeedPrefetchEnabled` persists, schedules sync, bumps updatedAt, unknown-id no-op |
| `tests/core/extractor/prefetch-feed-articles.test.ts` | Top-N selection per feed, feed scoping, idempotency on extracted articles, age-cutoff, no-candidate no-op |
| `tests/core/extractor/select-frequent-feeds.test.ts` | Pure heuristic: threshold + window cutoffs, unread = no contribution, per-feed counting |
| `tests/stores/feed-store-prefetch-schedule.test.ts` | `refreshAll` triggers per-feed + heuristic; gate-locked for free tier; doesn't double-prefetch toggled+frequent |
| `tests/components/sidebar/feed-item.test.tsx` | Dropdown wires the toggle; check icon reflects state |

## Design Decisions

- **Explicit toggle + heuristic, not one or the other.** Power users want explicit control; lighter users want it to just work. The heuristic threshold (10 reads in 30 days) is conservative enough that a one-off article from "the magazine of the week" doesn't pull a hundred extractions; the toggle lets a user force the behaviour for a feed they care about that's just published.
- **Reuse the starred-prefetch infrastructure.** `prefetchOne` (the per-article fetch + extract + persist) is shared. The age cutoff and concurrency cap are honoured uniformly — adding a third prefetch trigger doesn't widen our publisher-etiquette surface.
- **`selectFrequentFeeds` is pure.** Test it deterministically with synthetic articles; no need to mock the vault or the proxy. The wiring layer composes the result with the explicit toggle.
- **Read-count counter lives nowhere.** `readAt` is set on existing `updateArticle` writes during the auto-mark-read delay; there is no separate "reads table" to keep in sync with the article store. The selector walks the in-vault article set on each prefetch tick.
- **`schedulePrefetch` returns a promise.** Tests can `await` completion; production wraps with `void`. Same shape as the rules `persistFeedRules` extracted helper — one place to look when "prefetch isn't running".
- **The frequency window + threshold are constants, not user-tweakable.** They have one obviously sensible value pair (30 days, 10 reads). Adding a setting buys nothing and adds a config surface to test.

## Limitations

- **First-run cold start.** Until the user reads some articles, the heuristic produces nothing. The explicit toggle is the only path. Acceptable — new feeds don't deserve prefetch yet.
- **No per-feed exclude.** Once a feed crosses the read threshold it's auto-prefetched until reads age out of the window. A "never prefetch this" exclusion list would let a user opt out — not blocking, but worth noting.
- **Single-pass: the prefetch limit is fixed at 20.** A heavy-reader feed with hundreds of new articles per refresh still gets only 20 pre-extracted. Acceptable for v1; if it becomes a complaint, exposing the limit as a per-feed setting is one line.
- **No batched re-prefetch for older articles.** If a feed sat below the threshold for months and crosses it now, we prefetch only the next refresh's top-N — older articles stay un-prefetched. The "Apply to existing" pattern from the rules feature could mirror here later.
