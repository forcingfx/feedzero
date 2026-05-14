# Feature 013: Article flood grouping

## Status
Implemented

## Summary

In multi-feed views ("All items" and folder views), some feeds publish
"floods" — five or more articles within minutes of each other — that crowd
the article list and bury other sources. This feature detects runs of
consecutive same-feed articles published close together and replaces the
hidden ones with a single in-list **summary row**: "Show N more from
<Publication>" with the source feed's favicon. Clicking the summary row
expands the group inline; clicking again collapses it. The summary row IS
the toggle. On by default; toggle in Settings.

**Only applies in aggregated views.** Single-feed views never group — the
user has already chosen to focus on that source, so collapsing floods
would just hide content they explicitly asked to see.

## Design rationale

The article list is a strict, virtualized row component — every row is a
uniform-height box that the virtualizer measures via `getBoundingClientRect`.
An earlier "stack of cards" prototype with absolute-positioned ghost cards
behind the top article bled past the wrapper's measured bottom and visually
overlapped neighbouring rows. The current design avoids that entirely: the
summary row IS just another list row. No card chrome, no overflow tricks, no
negative-z layers.

## Behaviour

```gherkin
Feature: Article flood grouping

  Scenario: Five same-feed articles within the grouping window collapse in /feeds/all
    Given the user is on /feeds/all (aggregated view)
    And a single feed has published 5 articles within 10 minutes of each other
    When the article list renders
    Then the most recent article appears as the only article row for that run
    And the next row says "Show 4 more from <Publication>" with a favicon and chevron

  Scenario: Single-feed view never collapses, even at scale
    Given the user is on /feeds/<feedId> (single-feed view)
    And the feed has published 20 articles within 10 minutes
    When the article list renders
    Then all 20 articles appear as individual rows
    And no summary row is shown

  Scenario: Four-article flood is below the threshold and renders flat
    Given the user is on /feeds/all
    And a feed has published 4 articles within 10 minutes
    When the article list renders
    Then all 4 appear as individual rows
    And no summary row is shown

  Scenario: Long burst stays as one group
    Given the user is on /feeds/all
    And a feed has published 8 articles, each 8 minutes apart
    When the article list renders
    Then they appear as: top article + "Show 7 more from <Publication>"
    # (pairwise rule — first→last spanning 56 minutes does not split the run)

  Scenario: A different-feed article interrupts the run
    Given a /feeds/all view showing articles A, B, A, A, A, A, A (with B from a different feed)
    When the article list renders
    Then the first A renders normally
    And B renders normally
    And the trailing five A articles render as: top A + "Show 4 more from <FeedA>"

  Scenario: Expanding the group
    Given a collapsed group with summary row "Show 3 more from TechCrunch"
    When I click the summary row
    Then all hidden articles render as separate list rows in-place
    And the summary row updates to "Collapse"

  Scenario: Collapsing the group
    Given an expanded group with summary row "Collapse"
    When I click the summary row
    Then the hidden articles disappear
    And the summary row updates to "Show N more from <Publication>"

  Scenario: User opens the top article
    Given a collapsed group
    When I click the top article row (NOT the summary row)
    Then that article opens in the reader panel
    And the group stays in its current state (no expand)

  Scenario: Keyboard navigation skips summary rows
    Given the article list with one collapsed group
    When I press j repeatedly
    Then the cursor walks article → article
    And never lands on a summary row
    # Summary rows are role="button", not role="option"

  Scenario: User disables grouping in Settings
    Given the "Group article floods" toggle is on
    When I toggle it off in Settings
    Then every group expands into its full article list
    And future renders skip grouping
    And the preference persists across reloads

  Scenario: Feed with bad timestamps does not collapse
    Given a feed where every article has publishedAt = 0 (parser failure)
    When the article list renders
    Then no grouping happens — every article is its own row
```

## Architecture

### Flow

1. `useArticleStore.articles` returns the visible articles sorted publishedAt-desc.
2. `ArticleList` reads `useAppStore.groupArticleFloods`.
3. When enabled, `ArticleList` passes the articles through `groupArticles()`
   to identify same-feed flood runs (≥3 articles, pairwise gaps ≤10min).
4. `ArticleList` owns an `expandedGroups: Set<string>` state and flattens
   each group into a uniform-row sequence:
   - **Collapsed**: `[topArticle, summaryRow{open: false}]`
   - **Expanded**: `[allArticles, summaryRow{open: true}]`
5. The virtualizer iterates that flat list. Every row is either an
   `ArticleItem` (`role="option"`) or an `ArticleGroupSummaryRow`
   (`role="button"`).
6. Clicking a summary row calls `toggleGroup(groupId)` which flips the
   group's entry in `expandedGroups`, causing the flat list to be
   recomputed and the virtualizer to re-measure.

### Files

| File | Role |
|------|------|
| `src/utils/constants.ts` | `ARTICLE_GROUPING` thresholds (`WINDOW_MS = 10 * 60 * 1000`, `MIN_GROUP_SIZE = 3`); `LOCAL_STORAGE.GROUP_ARTICLE_FLOODS` key |
| `src/lib/group-articles.ts` | Pure `groupArticles()` function + discriminated-union types `ArticleEntry \| ArticleGroup` |
| `src/components/articles/article-group-summary-row.tsx` | A single uniform list row that says "Show N more from <feed>" or "Collapse"; calls `onToggle` on click |
| `src/components/articles/article-list.tsx` | Walks articles through `groupArticles()`, holds `expandedGroups` state, flattens each group into `[top + summary]` or `[all + summary]` depending on state |
| `src/stores/app-store.ts` | `groupArticleFloods` boolean + `setGroupArticleFloods` setter, hand-rolled localStorage round-trip mirroring `feedSortMode` in feed-store |
| `src/components/settings/settings-menu.tsx` | "Group article floods" toggle row (both dropdown and sidebar variants) |

### Tests

| File | Coverage |
|------|----------|
| `tests/lib/group-articles.test.ts` | 13 cases: empty, singleton, sub-min, exact-min, long burst pairwise, gap break, cross-feed break, MIN_GROUP_SIZE override, WINDOW_MS=0, publishedAt=0 gate, id stability, order preservation, entry-wrapper shape |
| `tests/components/articles/article-group-summary-row.test.tsx` | 8 cases: collapsed label, expanded label, "this feed" fallback, NOT role="option", click → onToggle, 44px touch target, aria-label for both states |
| `tests/components/articles/article-list.test.tsx` | "article grouping" describe: 4 same-feed articles 1-min apart collapse into one role="option" + summary row; clicking the summary row reveals all 4 as role="option" and switches the label to "Collapse". Existing tests reset `groupArticleFloods: false` in `beforeEach` to insulate them from the new default. |
| `tests/stores/app-store.test.ts` | `groupArticleFloods` default-true, setter writes "false"/"true" to localStorage |

## Design Decisions

- **Summary row IS the toggle.** No separate chevron-on-the-card. The list
  stays a uniform strict row component; toggle state is signalled by the
  presence/absence of inner article rows, not by container chrome. This
  matches the user's invariant that "the list is a strict component".
- **Expansion state lives in `ArticleList`, not the row.** The flat-entries
  derivation depends on the expansion set, so the set has to be one level
  up. The row component is stateless and only knows whether it's open or
  closed via props.
- **Per-mount, not persisted.** Switching feeds resets the set (different
  articles → different group ids → different summary rows; no carryover).
  Intentional simplicity.
- **Pairwise gap rule, not window-from-first.** A feed bursting at 8-minute
  intervals for an hour should appear as one group, not chopped into pieces
  at arbitrary 10-minute marks from each head.
- **MIN_GROUP_SIZE = 5.** Floods of 2-4 articles are rarely noisy enough to
  warrant the summary row's chrome. Five is where one feed actually starts
  to dominate the visible window in aggregated views.
- **Gated on aggregated views only.** In `/feeds/<single-feed>` the user
  has already chosen to focus on that source — collapsing floods would
  hide content they explicitly asked to see. In `/feeds/all` and folder
  views the value is unambiguous: the user wants to scan multiple
  sources, and a single dominant feed defeats that goal.
- **Favicon in the summary row.** Provides a quick visual anchor to which
  feed produced the flood, matching the per-row favicon convention in
  aggregated views.
- **`publishedAt <= 0` never groups.** Feeds with missing/broken timestamps
  would otherwise have delta=0 and collapse into one giant group. Hard gate.
- **Stable group id from `feedId + head id + length`.** Survives a `read`
  flag toggle on any article — the group reference changes but the id is
  stable, so the `expandedGroups` Set still tracks it after the re-render.
- **Summary row is `role="button"`, NOT `role="option"`.** Keyboard nav
  (`j`/`k`) queries `[role="option"]` and clicks the next element. The
  summary row must not appear in that set or `j`/`k` would pause on it.
  Click activates via mouse or Tab+Enter.
- **Settings toggle lives in `app-store`.** Onboarding-status already lives
  there; the codebase pattern is hand-rolled try/catch localStorage (no
  `persist` middleware), so the addition matches.

## Limitations / future work

- **No aggregate `(N unread)` badge on the summary row.** If a group of 5
  has 3 unread, the summary row just says "Show 4 more from <Feed>". v2:
  show "Show 4 more (2 unread) from <Feed>".
- **Selected article inside a collapsed group** still triggers scroll to
  the row but is hidden inside; the user must click the summary row to
  reveal it. v2: auto-expand the group containing the selected id.
- **No `MAX_GROUP_SIZE` cap.** A feed that bursts hundreds of items will
  collapse into one giant group; expanding it shows the full list. Easy
  one-line addition to `groupArticles` if needed.

## Manual verification

Run `npm run dev`, open `http://localhost:3000`, subscribe to a flooding feed
such as Hacker News front-page RSS or Reddit `r/all` RSS, and confirm:

1. Groups form: top article followed by "Show N more from <Feed>" row.
2. Clicking the top article opens it in the reader.
3. Clicking the summary row expands the group inline; the row's label
   switches to "Collapse".
4. Clicking the "Collapse" row hides the inner articles again.
5. Pressing `j`/`k` walks article-to-article and never pauses on summary
   rows (collapsed: skips over the summary; expanded: walks through every
   inner article one by one).
6. Toggling Settings → "Group article floods" off immediately flattens every
   group; toggling on re-collapses.
7. `/feeds/all` and folder views still group when adjacent same-feed runs
   appear.
8. Mark-all-read while a group is expanded — the group stays expanded; the
   article rows visibly dim.
