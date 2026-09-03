# Feature 024: Reading appearance preferences

## Status
Implemented

## Summary

Four controls over how much of the app is on screen while you read: the
reader's column width, whether read articles stay in the list, whether
article rows carry their source favicon, and whether the feed list is
visible at all. Three are synced `UserPreferences` fields surfaced in
Settings → Reading; the fourth is the desktop sidebar collapse, which had
a keyboard shortcut and no effect until this feature.

All four came out of one piece of user feedback asking for "a more clean
and minimal look" plus browser-reader-style width control. They ship
together because they are the same request seen from four angles, and
because the first three share a storage path.

## Behaviour

```gherkin
Feature: Reading appearance

  Scenario: Widening the reader column
    Given I am reading an article
    When I choose "Wide" under Settings → Reading → Reading width
    Then the article column, its headings, and its body all widen together

  Scenario: Working a list down to empty
    Given "Hide read articles" is on
    And every article in the current view is read
    Then the list shows "You're all caught up."
    And it does not offer Refresh as the remedy

  Scenario: Reading with the filter on
    Given "Hide read articles" is on
    When I open an unread article and it is auto-marked read
    Then it stays in the list while I am reading it
    And it leaves the list once I move to another article

  Scenario: A genuinely empty feed is not "caught up"
    Given "Hide read articles" is on
    And the current feed has no articles at all
    Then the list offers Refresh, not the caught-up state

  Scenario: Tightening article rows
    Given I am in All items or a folder view
    When I turn off "Show feed icons"
    Then article rows drop the favicon and the column that held it
    And each row still names its source feed

  Scenario: Reclaiming the feed list's width
    Given I am on desktop
    When I press "[" or click the toggle in the article-list title bar
    Then the feed list collapses to zero width
    And it is removed from the tab order
    And it is still collapsed after a reload

  Scenario: Restoring a resized feed list
    Given I have dragged the feed list wider than the default
    When I collapse it and expand it again
    Then it returns to the width I dragged it to
```

## Architecture

### Flow

1. A control in Settings → Reading calls `usePreferencesStore.update()`
   with a one-field patch.
2. `update()` merges into the in-memory record, writes the encrypted
   `preferences` Dexie row, and schedules a debounced sync push.
3. Consumers read the field with a `?? default` fallback, so a preference
   row written by an older client parses and behaves as it did before.
4. The sidebar's collapsed state is deliberately *not* in that record —
   see Design Decisions.

### Files

| File | Role |
|------|------|
| `packages/core/src/types/index.ts` | `ReaderWidth`, `readerWidth`, `hideReadArticles`, `showArticleFeedIcons` and their defaults |
| `src/components/settings/tabs/reading-tab.tsx` | The four controls; `SegmentedPreference` backs the two segmented ones |
| `src/components/reader/reader-panel.tsx` | `READER_WIDTH_CLASS`; sole owner of the reading measure |
| `src/components/reader/article-content.tsx` | Carries no measure of its own |
| `src/components/articles/article-list.tsx` | `visibleArticles` filter, `CaughtUpArticleList`, favicon gating |
| `src/pages/app-layout.tsx` | Collapsible sidebar panel, cookie restore, width reconciliation |
| `src/components/articles/article-list-controls.tsx` | `SidebarCollapseButton` |
| `src/components/ui/sidebar.tsx` | `useOptionalSidebar`, exported `SIDEBAR_COOKIE_NAME` |

### Tests

| File | Coverage |
|------|----------|
| `tests/types/preferences.test.ts` | The record's shape — a tripwire that forces every new field to be acknowledged |
| `tests/components/settings/reading-tab.test.tsx` | Each control's default, and that changing it persists |
| `tests/components/reader/reader-panel.test.tsx` | Width classes; no competing measure inside the column |
| `tests/components/reader/article-content.test.tsx` | Pins that the body sets no measure of its own |
| `tests/components/articles/article-list-hide-read.test.tsx` | Filtering, the open-article exemption, caught-up vs empty |
| `tests/components/articles/article-list-feed-icons.test.tsx` | Icon and side-column removal; feed name survives |
| `tests/components/layout/sidebar-collapse.test.tsx` | A11y-tree removal, both toggle paths, cookie restore |
| `tests/e2e/sidebar-collapse.spec.ts` | The reclaimed pixels, across a reload, restoring the dragged width |

## Design Decisions

- **One owner for the reading measure.** ReaderPanel's `<article>` sets
  the width; ArticleContent sets none. Two owners meant "Wide" would have
  rendered headings at 60rem and prose at 45rem. The cost is that
  ArticleContent can no longer be dropped into an unconstrained parent.

- **The open article is exempt from the unread filter.** Selecting an
  article auto-marks it read, so a plain `!read` filter would delete the
  row under the reader mid-sentence. It leaves once you move on, which is
  the behaviour NetNewsWire and Vienna settled on.

- **Caught-up is its own empty state.** `EmptyArticleList` offers Refresh
  and can surface a fetch error. Reaching the end of your unread items is
  success, and prescribing a network fetch for it would read as a fault
  report.

- **Hiding the favicon withholds the row's site URL** rather than adding
  a branch inside `ArticleItem`. The side column disappears with the icon;
  keeping an empty column would have widened the row in exchange for a
  request to tighten it.

- **The sidebar panel collapses; it is not unmounted.** ADR 013 requires
  the outer group's child set to stay constant. Unmounting the panel is
  precisely the layout recompute that made the sidebar jitter on every
  navigation.

- **Collapsed-but-present needs `hidden`.** A 0px `overflow-hidden` panel
  still contains every feed link, so without it the user would tab
  through a sidebar they cannot see.

- **Sidebar collapse is device-local, not synced.** It rides the
  `sidebar_state` cookie that SidebarProvider already wrote (and nobody
  read). It matches how sidebar *width* is stored, and a phone has no
  opinion about a desktop sidebar. The three reading preferences are
  synced because they describe how you like to read, not this screen.

- **The panel can be collapsed two ways.** Dragging the handle past
  `minSize` collapses it without going through `open`. `onResize`
  reconciles the two, so a drag-collapse does not leave the next `[`
  looking dead.

## Limitations

- Reading width offers three steps rather than a continuous slider. Three
  named options are describable in a settings row; a slider would need a
  live preview to be usable.
- "Hide read articles" is global, not per feed or folder. A per-view
  override would need a place to live in the view's own settings.
- With the filter on, finishing an article shifts the list up by a row.
  Sticky-until-refresh semantics would read better but need per-view
  session state that survives store reloads.
- Sidebar collapse is desktop-only; mobile keeps the feed list in a
  drawer, which is collapsed by construction.
