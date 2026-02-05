# Feature 011: Global Feed (All Items)

## Status
Implemented

## Summary

An "All items" entry at the top of the feed list aggregates articles from all feeds into a single unified view. Each article displays which feed it originates from. This provides users with a chronological timeline of all their subscribed content.

## Behaviour

```gherkin
Feature: Global feed (All items)

  Rule: All items appears in sidebar

  Scenario: All items entry is visible
    Given the user has feeds
    When they view the sidebar
    Then "All items" appears at the top of the feed list
    And it has a distinct Layers icon

  Scenario: All items is selectable
    When the user clicks "All items"
    Then it becomes the selected feed
    And the URL changes to /feeds/all

  Rule: All items shows aggregated articles

  Scenario: View all articles across feeds
    Given the user has multiple feeds with articles
    When the user selects "All items"
    Then the article list shows articles from all feeds
    And articles are sorted by date (newest first)

  Scenario: Each article shows its source feed
    Given the user is viewing "All items"
    Then each article displays the feed's favicon on the left
    And each article displays the feed name before the author/date line

  Scenario: Empty state when no articles exist
    Given the user has feeds but no articles
    When the user selects "All items"
    Then the article list shows "No articles found."

  Rule: Navigation works in global view

  Scenario: Select article in global view
    Given the user is viewing "All items"
    When the user clicks an article
    Then the article is selected
    And the reader panel shows the article content
    And the article is marked as read

  Scenario: Keyboard navigation j/k
    Given the user is viewing "All items"
    When the user presses "J" or "K"
    Then navigation cycles through all articles
    And articles from any feed can be selected

  Scenario: Feed navigation u/i includes All items
    Given the user has feeds
    When the user presses "U" or "I"
    Then "All items" is included in the navigation cycle
```

## Architecture

### Flow

1. User clicks "All items" in sidebar
2. `handleSelect(ALL_FEEDS_ID)` is called
3. Navigation changes URL to `/feeds/all`
4. FeedsPage detects `feedId === "all"` from URL params
5. `loadArticles(ALL_FEEDS_ID)` is called on article store
6. Article store detects `ALL_FEEDS_ID` and calls `getAllArticles()` instead of `getArticles(feedId)`
7. Database returns all articles from all feeds, sorted by `publishedAt` descending
8. ArticleList renders articles with `feedTitle` and `feedSiteUrl` props when in global view
9. Each ArticleItem displays feed favicon and feed name from `feedsById` lookup

### Files

| File | Role |
|------|------|
| `src/utils/constants.ts` | Defines `ALL_FEEDS_ID = "all"` constant |
| `src/core/storage/db.ts` | `getAllArticles()` fetches all articles across feeds |
| `src/stores/article-store.ts` | Conditional load and validation for global view |
| `src/stores/feed-store.ts` | `selectFeedsById` selector for feed title lookup |
| `src/components/layout/app-sidebar.tsx` | "All items" menu entry with Layers icon |
| `src/components/articles/article-list.tsx` | Passes `feedTitle` and `feedSiteUrl` to items in global view |
| `src/components/articles/article-item.tsx` | Displays optional `feedTitle` and `feedSiteUrl` (favicon) props |
| `src/components/reader/reader-panel.tsx` | Allows global view in feedId validation |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/storage/db.test.js` | 2 tests: getAllArticles returns sorted articles from all feeds |
| `tests/utils/constants.test.js` | 1 test: ALL_FEEDS_ID constant |
| `tests/stores/article-store.test.ts` | 2 tests: loadArticles with ALL_FEEDS_ID, selectArticle validation |
| `tests/stores/feed-store.test.ts` | 2 tests: selectFeedsById selector |
| `tests/components/articles/article-item.test.tsx` | 6 tests: feedTitle and feedSiteUrl prop rendering |
| `tests/components/articles/article-list.test.tsx` | 4 tests: feedTitle and feedSiteUrl in global view |
| `tests/components/reader/reader-panel.test.tsx` | 1 test: renders article in global view |
| `tests/components/layout/app-sidebar-all-items.test.tsx` | 5 tests: All items entry behavior |

## Design Decisions

- **URL `/feeds/all`** — Uses the existing route pattern with "all" as a reserved feedId. Clean, bookmarkable, and requires no route changes.

- **`ALL_FEEDS_ID` constant** — Single source of truth for the magic value. Easy to grep and prevents typos.

- **Database-level aggregation** — `getAllArticles()` fetches all articles in one query instead of iterating feeds. More efficient for large datasets.

- **Feed context as props, not type change** — `feedTitle` and `feedSiteUrl` are passed to `ArticleItem` as display props rather than adding them to the `Article` type. The Article type is a storage schema; feed names and favicons are UI concerns.

- **Memoized feedsById** — Uses `useMemo` in ArticleList to prevent infinite re-renders from creating new objects on each render.

- **Validation bypass** — Article store's `selectArticle()` and reader panel's defensive check both skip feedId validation when `selectedFeedId === ALL_FEEDS_ID`.

## Limitations

- No unread count badge on "All items" (future enhancement)
- No filtering within global view (e.g., show only unread)
- No pagination for large article sets — all articles load at once
- "All items" position is hardcoded at top (cannot be reordered)
