# Feature 005: Feed Refresh

## Status
Implemented

## Summary

Feeds can be refreshed to fetch new articles and update changed ones. Refresh happens automatically on app load and can be triggered manually per-feed or for all feeds. New articles are detected via guid-based deduplication using a compound IndexedDB index.

## Behaviour

```gherkin
Feature: Feed refresh

  Scenario: Auto-refresh on app load
    Given the user opens the app with existing feeds
    When the app finishes initializing
    Then all feeds are refreshed in the background
    And new articles appear in the feed list

  Scenario: Manual refresh all feeds
    Given the user has multiple feeds
    When the user clicks "Refresh All"
    Then all feeds are fetched and parsed
    And new articles are added
    And the feed list is updated

  Scenario: Manual refresh single feed
    Given the user is viewing a feed's articles
    When the user clicks the refresh button on the article list
    Then only that feed is refreshed
    And the article list is updated with new articles

  Scenario: Duplicate articles are skipped
    Given a feed has been refreshed
    When a refresh returns articles already in the database
    Then existing articles are not duplicated
    And articles with changed content are updated

  Scenario: Double-click prevention
    Given the user clicks refresh
    When they click refresh again before the first completes
    Then only one refresh operation runs

  Rule: Keyboard shortcut refreshes all feeds

  Scenario: Refresh via keyboard
    Given the user has feeds
    When the user presses "R"
    Then all feeds are refreshed
    And the refresh button shows "Refreshing..." state
    And new articles appear in the list

  Scenario: R key while refreshing is ignored
    Given a refresh is already in progress
    When the user presses "R"
    Then no additional refresh starts
```

## Architecture

### Flow

1. Event emitted: `feeds:refresh-all` or `feed:refresh`
2. `main.js` handler calls `refreshAllFeeds()` or `refreshFeed(feed)`
3. `feed-service.js` fetches and parses the feed
4. For each parsed article, checks `getArticleByGuid(feedId, guid)`:
   - Not found → `addArticles()` (new article)
   - Found + content changed → `updateArticle()` (update)
   - Found + unchanged → skip
5. UI refreshed via `setFeeds()` / `setArticles()`

### Files

| File | Role |
|------|------|
| `src/core/feeds/feed-service.js` | `refreshFeed()`, `refreshAllFeeds()` — fetch, parse, dedup, store |
| `src/core/storage/db.js` | `getArticleByGuid(feedId, guid)` — compound index lookup |
| `src/core/storage/schema.js` | `createArticle()` accepts `guid` param, defaults to `link` |
| `src/stores/feed-store.ts` | `refreshAll()` action with `isRefreshingAll` guard |
| `src/components/layout/app-sidebar.tsx` | "Refresh" button calls `refreshAll()` |
| `src/hooks/use-keyboard-nav.ts` | R key calls `refreshAll()` directly |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/feeds/feed-service.test.js` | 6 tests: refreshFeed (new articles, skip duplicates, update changed, handle errors), refreshAllFeeds (multiple feeds, empty list) |
| `tests/core/storage/db.test.js` | 3 tests: getArticleByGuid (found, not found, wrong feedId) |

## Design Decisions

- **Guid-based dedup** — Uses a `[feedId+guid]` compound index for O(1) lookup without decrypting article content. Guid defaults to `link` if the feed doesn't provide one.
- **Sequential refresh** — Feeds are refreshed one at a time to avoid overwhelming the proxy. Could be parallelized later.
- **Debounce via flag** — `main.js` uses boolean guards (`refreshingAll`, `refreshingFeed`) to prevent concurrent refresh operations from double-clicks.
- **Non-blocking auto-refresh** — On app load, refresh runs in the background without blocking the UI.
- **DB schema v2** — Bumped from v1 to v2 to add the compound index. Dexie handles migration automatically.

## Limitations

- No refresh interval — auto-refresh only on app load, no periodic polling
- Sequential refresh could be slow with many feeds
- No visual progress indicator during refresh
