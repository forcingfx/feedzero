# Feature 005: Feed Refresh

## Status
Implemented

## Summary

Feeds can be refreshed to fetch new articles and update changed ones. Refresh happens automatically on app load, on a background interval (`AUTO_REFRESH_INTERVAL_MS`, 30 min) while the app is open, and when a stale tab regains focus. It can also be triggered manually. The global "refresh all" control lives on the desktop sidebar header, the mobile nav-drawer row, and the `R` keyboard shortcut. The **header refresh control** (mobile header pill) is instead **scoped to the current view** via `refreshView`: viewing a single feed refreshes only that feed, a folder refreshes only its members, and an aggregated view (All items / Starred / a smart filter) refreshes every feed. When an article list is empty, that same scoped refresh is offered as a prominent in-list button. New articles are detected via guid-based deduplication using a compound IndexedDB index.

## Behaviour

```gherkin
Feature: Feed refresh

  Scenario: Auto-refresh on app load
    Given the user opens the app with existing feeds
    When the app finishes initializing
    Then all feeds are refreshed in the background
    And new articles appear in the feed list

  Scenario: Periodic background refresh
    Given the app has been open with existing feeds
    When AUTO_REFRESH_INTERVAL_MS elapses
    Then all feeds are refreshed in the background

  Scenario: Refresh on focus when stale
    Given the app has been in a background tab longer than AUTO_REFRESH_INTERVAL_MS
    When the user returns focus to the tab
    Then all feeds are refreshed
    But a return within the interval does not trigger a refresh

  Scenario: Scoped refresh from the mobile header
    Given the user is on a mobile viewport viewing a single feed
    Then a "Refresh" control is available in the header
    When the user taps it
    Then only that feed is refreshed and its article list updates in place
    And the control shows a spinning "Refreshing…" state

  Scenario: Scoped refresh of an aggregated view
    Given the user is viewing All items, Starred, or a smart filter
    When the user taps the header "Refresh" control
    Then every feed is refreshed (the view aggregates across all feeds)

  Scenario: Scoped refresh of a folder
    Given the user is viewing a folder
    When the user taps the header "Refresh" control
    Then only the folder's member feeds are refreshed

  Scenario: Refresh path from an empty article list
    Given the selected feed/folder/filter has no articles and is not loading
    Then the article list shows a prominent "Refresh" button
    When the user taps it
    Then the current view is refreshed and any new articles appear in place

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
| `src/stores/feed-store.ts` | `refreshAll()` (global) + `refreshView(feedId)` (scoped: concrete feed / folder members / aggregated→all, then reloads the article list); both guard on `isRefreshingAll`; only full refreshes stamp `lastRefreshAllAt`; per-feed `refreshSingleFeed`/`reloadSingleFeed` |
| `src/hooks/use-auto-refresh.ts` | Background interval + focus-when-stale refresh; mounted in `AppLayout` |
| `src/components/layout/app-sidebar.tsx` | Desktop sidebar "Refresh" button calls `refreshAll()` (global) |
| `src/components/articles/article-list-controls.tsx` | Mobile header `RefreshPill` calls `refreshView(selectedFeedId)` (scoped to the current view) |
| `src/components/articles/article-list.tsx` | `EmptyArticleList` — prominent in-list "Refresh" button when the view has no articles; calls `refreshView` |
| `src/components/layout/mobile-nav-drawer.tsx` | Mobile nav-drawer "Refresh all" row calls `refreshAll()` (global) |
| `src/components/feeds/feed-settings-dialog.tsx` | Per-feed "Refresh now"/"Clear cached articles" with pending state + toast |
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

- Background refresh only runs while a tab is open — there is no Service Worker / push-based update when the app is closed
- Sequential refresh could be slow with many feeds
