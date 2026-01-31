# Feature 007: Remove Feed

## Status
Implemented

## Summary

Users can remove a feed and all its associated articles via a delete button on each feed item. A confirmation dialog prevents accidental deletion.

## Behaviour

```gherkin
Feature: Remove feed

  Scenario: Remove a feed
    Given the user has added feeds
    When the user hovers over a feed in the feed list
    And clicks the × button
    And confirms the dialog
    Then the feed is deleted from storage
    And all articles belonging to that feed are deleted
    And the feed list is updated
    And the article list and article view are cleared

  Scenario: Cancel removal
    Given the user clicks the × button on a feed
    When they cancel the confirmation dialog
    Then no data is deleted
    And the feed list remains unchanged

  Scenario: Remove does not trigger selection
    Given the user clicks the × button on a feed
    Then the feed is not selected
    And no feed:selected event is emitted
```

## Architecture

### Flow

1. User hovers over a feed → × button becomes visible
2. User clicks × → `confirm()` dialog shown
3. On confirm → `feed-list.js` emits `feed:removed` with `{ feedId }`
4. `main.js` handler calls `removeFeed(feedId)` from `db.js`
5. `removeFeed()` deletes the feed record and bulk-deletes all articles with matching `feedId`
6. Feed list refreshed via `getFeeds()` + `setFeeds()`
7. Article list and article view cleared

### Files

| File | Role |
|------|------|
| `src/ui/components/feed-list.js` | × button per feed, confirm dialog, emits `feed:removed` |
| `src/main.js` | Handles `FEED_REMOVED` event: delete from DB, refresh UI, clear panels |
| `src/core/storage/db.js` | `removeFeed(id)` — deletes feed + associated articles via `feedId` index |

### Tests

| File | Coverage |
|------|----------|
| `tests/ui/components/feed-list.test.js` | 4 tests: button renders with aria-label, emits on confirm, does not emit on cancel, does not trigger feed:selected |

## Design Decisions

- **Confirmation dialog** — Uses native `confirm()` to prevent accidental deletion. Lightweight, no custom modal needed.
- **Hover-reveal button** — The × button is hidden by default and shown on hover (or focus-visible), keeping the feed list clean.
- **Click event isolation** — The remove button click handler returns early before the feed selection handler runs, preventing unintended side effects.
- **Cascading delete** — `removeFeed()` deletes both the feed and all its articles in one operation using the `feedId` index.

## Limitations

- No undo — deletion is permanent once confirmed
- `confirm()` is synchronous and blocks the UI thread (acceptable for this use case)
- No batch delete (remove multiple feeds at once)
