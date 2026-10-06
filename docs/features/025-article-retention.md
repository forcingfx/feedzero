# Feature 025: Article Retention

## Status
Implemented

## Summary

Articles published longer ago than the user's retention period are deleted, read or unread, unless they are starred. The default is 30 days; Settings → Reading → Keep articles offers 7 days, 14 days, 30 days, 90 days, 1 year and Forever. The setting syncs with the vault, and so does its effect: a purge on one device reaches the others on their next pull. Retention is what keeps a vault bounded; without it, a feed nobody reads grows the vault forever.

## Behaviour

```gherkin
Feature: Article retention

  Scenario: Old articles are purged
    Given retention is 30 days
    When any refresh finishes (including the one at app start)
    Then unstarred articles published more than 30 days ago are deleted, read or not
    And their offline copies go with them

  Scenario: Starred articles are kept
    Given a starred article published a year ago
    When retention runs
    Then it is kept

  Scenario: The open article is spared
    Given the user is reading an article older than the period
    When a refresh purges
    Then that article stays open and in the list until a later purge

  Scenario: A purged article does not come back
    Given an article was purged but is still in its feed
    When the feed refreshes, is reloaded, or is subscribed to again
    Then it is not re-added

  Scenario: Existing vaults on upgrade
    Given a vault created before retention existed
    When the updated app refreshes for the first time
    Then the 30-day default applies, silently

  Scenario: Shortening the period asks first
    Given retention is 90 days and 3 unstarred articles are older than 7 days
    When the user picks 7 days
    Then a dialog says "Remove 3 articles?"
    And Cancel leaves the period and every article as they were
    And confirming applies the period and deletes them

  Scenario: Lengthening, or shortening that removes nothing
    When the user picks a longer period, or a shorter one nothing exceeds
    Then it applies at once, without a dialog
```

## Architecture

### Flow

1. Every refresh path (`refreshAll`, `refreshView`, `reloadSingleFeed`) ends in `reloadArticleStoreForView` (`src/stores/feed-store.ts`), which calls `useArticleStore.purgeExpired()` before reloading the open list.
2. `purgeExpired` calls `purgeExpiredArticles({ keep })` with the open article's id, and schedules a sync push when anything went. It is best-effort: a failed purge never fails the refresh.
3. `purgeExpiredArticles` reads the period from the encrypted preferences row (absent → 30 days), records the guids of expired `datePresumed` articles on their feeds (`retiredGuids`), then bulk-deletes the expired ids.
4. On ingest (`refreshFeed`, `addFeedFlow`, `reloadFeed`), a feed item not already stored is admitted only if `admitsOnIngest` agrees: a dated item by age, an undated one by the feed's retired guids. Refresh then drops retired guids the feed no longer carries.
5. Settings: picking a shorter period calls `countArticlesExpiredBy` and, when it is non-zero, confirms; `setArticleRetention` saves the preference and runs the same purge-then-reload path.

### Files

| File | Role |
|------|------|
| `src/core/storage/article-retention.ts` | The rule (`retentionCutoff`, `isExpired`, `admitsOnIngest`), the purge, the count |
| `src/core/storage/db.ts` | `removeArticles(ids)` |
| `src/core/storage/schema.ts` | `createArticle` marks undated items `datePresumed` |
| `src/core/feeds/feed-service.ts` | Ingest filter in `refreshFeed`, `addFeedFlow`, `reloadFeed`; retired-guid pruning |
| `src/stores/article-store.ts` | `purgeExpired()`: sparing the open article, best-effort, schedules a push |
| `src/stores/feed-store.ts` | `reloadArticleStoreForView` purges before every post-refresh reload |
| `src/stores/preferences-store.ts` | `countArticlesExpiredBy`, `setArticleRetention` |
| `src/components/settings/article-retention-setting.tsx` | Keep articles select + "Remove N articles?" confirm |
| `packages/core/src/types/index.ts` | `ArticleRetention`, `DEFAULT_ARTICLE_RETENTION`, `UserPreferences.articleRetention`, `Article.datePresumed`, `Feed.retiredGuids` |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/storage/article-retention.test.ts` | Purge rule against the real db: age, starred, never, default for legacy vaults, `keep`, count |
| `tests/core/feeds/refresh-retention.test.ts` | Ingest: refresh, subscribe and reload skip old items; purged undated items stay gone; retired guids are forgotten when they leave the feed |
| `tests/integration/feed-store-db.test.ts` | A refresh purges from db and open list; the open article is spared |
| `tests/components/settings/article-retention-setting.test.tsx` | Select, confirm count (starred excluded), cancel, confirm, no-dialog paths |
| `tests/e2e/article-retention.spec.ts` | Settings → shorten → confirm → expired articles leave the list |

## Design Decisions

- **Starring is the only exemption.** Unread articles are purged too: a feed nobody reads is exactly the one that would otherwise grow the vault without bound. Owner's call.
- **Retention applies at ingest, not only at purge.** Refresh dedupes against stored rows only, so a purged article still in the publisher's feed would come straight back as new and unread. Dated items are filtered by age; undated ones get "now" as their date and always look new, so they are tombstoned by guid instead (`Feed.retiredGuids`), and a tombstone is dropped once the item leaves the feed, keeping the list no longer than the feed.
- **Age is the publish date.** For undated items it is the time the app first saw them.
- **Existing vaults get the default silently.** The field is optional; absent reads as 30 days. Owner's call, over a one-time notice or grandfathering to Forever.
- **Shortening confirms with a count; nothing else does.** Deletion is permanent and syncs everywhere; lengthening or a no-op shortening has nothing to warn about.
- **The open article is spared** for the same reason a refresh no longer closes it (feature 005): reading is never interrupted by housekeeping. It goes on a later purge.
- **A native `<select>`** rather than a segmented control: six options do not fit across a phone, and phones get their own picker.

## Limitations

- A feed whose newest item is older than the period shows no articles after subscribing. The list's empty state does not yet say why.
- An undated article stored before this feature has no `datePresumed` flag, so if it is purged while still in its feed it comes back once, flagged, and is tombstoned on its next purge.
- The confirm count includes the open article, which the purge then spares, so the count can be one higher than what is removed.
- A feed write from a stale in-memory copy could drop a tombstone written by a purge in between; store mutators re-read the feed before writing, and refresh reads tombstones from the db, so this needs a race no current path produces.
