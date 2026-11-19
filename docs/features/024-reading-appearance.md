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

### Update 2026-11-08 (issue #341)

A second user asked for "bigger text, more line-height and more width".
Text size gained **Extra large**, reading width gained **Full** (no max
width), and a new synced **Line spacing** preference (`readerLineHeight`:
Compact / Normal / Relaxed) was added. Like the measure, line spacing is
set only on the reader's `<article>` column; `ArticleContent` carries no
leading of its own. Covered by `tests/e2e/reading-appearance.spec.ts`,
which asserts the computed font size and line height.

### Update 2026-11-10 (issue #340)

**Show article images** (Settings → Reading, off by default) puts each
article's lead image at the left of its row. The parser picks the image
per item (`src/core/parser/item-image.ts`: media:thumbnail, then an image
media:content, then an image enclosure, then the first `<img>` in the
body; absolute http(s) only) and stores it as `Article.imageUrl`. The row
loads it through `/api/icon?url=` with `referrerPolicy="no-referrer"`,
lazily, and hides itself on error. Off by default because every row's
image is a request that tells the image host what the reader is looking
at; the setting's copy says so. The list passes `imageUrl` to the row only
when the preference is on, so a disabled setting renders no `<img>` at all.

### Update 2026-11-19 (list appearance, user report)

A reader moving from Inoreader found the phone list cramped and hard to
triage. Two more synced preferences and a reworked row:

- **Show article preview** (`showArticlePreview`, on by default): up to
  two lines of the article's opening text under the title.
  `src/lib/article-list-preview.ts` takes the summary, else the body,
  else the fetched full text, strips it to plain text, clips it, and
  returns nothing when it only repeats the title. It is on by default
  because the text is already in the vault: unlike article images it
  makes no request.
- **List size** (`listTextSize`, Small to Extra large, default Medium):
  one font-size class on the list. Rows size their text, icons and
  padding in `em`, so a row scales as a whole. It is separate from the
  reader's text size because large article text with a dense list is a
  common pairing.
- **Source row**: the favicon now leads the feed name, as in the reader,
  where it used to sit in a right-hand column. The row is one line: feed
  name and author truncate, the time never does. An author that repeats
  the feed name (every YouTube feed) is omitted. The time is relative
  ("7m ago") with the full date in the `<time>` element's `title`.
- **Favicons** lost their ring and inset, which read as a white frame
  on a dark list. The white backing in dark mode stays, behind
  transparent pixels only, so dark-on-transparent icons remain visible.

Phone sizing of the reader chrome and the feed drawer from the same
report is recorded in `010-mobile-navigation.md`.

### Update 2026-11-19 (article text preview)

Settings → Reading shows a live **Preview** of article text under the
Text size, Reading width and Line spacing controls, so a reader sees the
effect without leaving settings. It is accurate by construction:
`readerColumnClass()` in `src/components/reader/reader-typography.ts` is
the one class builder for both the reader's column and the preview
(`src/components/settings/reading-preview.tsx`), and the sample goes
through the reader's `ArticleContent`.

Text size and line spacing are shown at real size. **Reading width is
drawn to scale**, not at its real measure (fix, 2026-11-19): the settings
pane is about 700px wide, so the reader's measures (600 / 720 / 960px /
none) mostly overflowed it and three of the four options looked the same,
which read as a setting that did nothing. The preview column now takes a
share of the pane (50 / 60 / 80 / 100%, the measures against a 1200px
reader) and the preview's header states the real measure. Below the `lg`
breakpoint the header says instead that an article fills the screen at
every width, which is what the reader does there. The sample's link is
inert.

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
    And it stays when I open the next article, so no row moves
    And every article read during this visit leaves the list when I
      switch to another view and come back

  Scenario: A genuinely empty feed is not "caught up"
    Given "Hide read articles" is on
    And the current feed has no articles at all
    Then the list offers Refresh, not the caught-up state

  Scenario: Tightening article rows
    Given I am in All items or a folder view
    When I turn off "Show feed icons"
    Then article rows drop the favicon and the column that held it
    And each row still names its source feed

  Scenario: Triage from the list
    Given "Show article preview" is on
    Then each row shows up to two lines of the article's opening text
    And a row whose article has no text shows none

  Scenario: Choosing the list size
    When I choose "Large" under Settings → Reading → List size
    Then row titles, previews, source rows and spacing grow together
    And the reader's text size is unchanged

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
| `packages/core/src/types/index.ts` | `ReaderWidth`, `readerWidth`, `ReaderLineHeight`, `readerLineHeight`, `hideReadArticles`, `showArticleFeedIcons` and their defaults |
| `src/components/settings/tabs/reading-tab.tsx` | The four controls; `SegmentedPreference` backs the two segmented ones |
| `src/components/reader/reader-typography.ts` | `readerColumnClass()`: text size, measure and line spacing of the reading column; sole owner of the reading measure |
| `src/components/reader/reader-panel.tsx` | Applies `readerColumnClass()` to the `<article>` column |
| `src/components/settings/reading-preview.tsx` | Live sample in settings, styled by the same builder |
| `src/components/reader/article-content.tsx` | Carries no measure of its own |
| `src/components/articles/article-list.tsx` | `visibleArticles` filter, `CaughtUpArticleList`, favicon and preview gating, `LIST_TEXT_SIZE_CLASS` |
| `src/components/articles/article-item.tsx` | The row: title, preview, one-line source row, all sized in `em` |
| `src/lib/article-list-preview.ts` | Plain-text preview for a row |
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
| `tests/components/articles/article-list-feed-icons.test.tsx` | Icon gating; feed name survives; preview gating; list size marker |
| `tests/components/articles/article-item.test.tsx` | Favicon before the feed name, repeated author dropped, relative time, preview |
| `tests/lib/article-list-preview.test.ts` | Source order, plain text, clipping, title repeats |
| `tests/components/layout/sidebar-collapse.test.tsx` | A11y-tree removal, both toggle paths, cookie restore |
| `tests/e2e/sidebar-collapse.spec.ts` | The reclaimed pixels, across a reload, restoring the dragged width |

## Design Decisions

- **One owner for the reading measure.** ReaderPanel's `<article>` sets
  the width; ArticleContent sets none. Two owners meant "Wide" would have
  rendered headings at 60rem and prose at 45rem. The cost is that
  ArticleContent can no longer be dropped into an unconstrained parent.

- **Articles read during a visit are exempt from the unread filter.**
  Selecting an article auto-marks it read, so a plain `!read` filter would
  delete the row under the reader mid-sentence. The first rule kept only
  the open article, so opening the next one removed the previous row and
  shifted the list while the mobile reader was still sliding in (owner
  report, 2026-11-10). Every article opened in a view now stays until the
  view changes (`useKeptReadThisVisit` in `article-list.tsx`).
- **Mobile shows no persistent selection highlight.** The list there is
  not a split view; a highlight only flashed between rows as the reader
  opened and closed. Desktop keeps it.

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
