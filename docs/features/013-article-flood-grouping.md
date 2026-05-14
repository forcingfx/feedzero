# Feature 013: Article flood grouping

## Status
Implemented

## Summary

Some feeds publish "floods" — many articles within minutes of each other — that
crowd the article list and bury everything else. This feature detects runs of
consecutive same-feed articles published close together and collapses them into
a layered "stack of cards" (iOS-notification style) inside the article list. A
"+N more" chevron expands the stack inline. On by default; toggle in Settings.

## Behaviour

```gherkin
Feature: Article flood grouping

  Scenario: Three same-feed articles within the grouping window collapse
    Given a feed has published 3 articles within 10 minutes of each other
    When the article list renders
    Then the three articles appear as a single visual stack
    And the top card looks identical to a normal article row
    And the stack shows "+2 more" with a chevron and ghost cards behind

  Scenario: Long burst stays as one stack
    Given a feed has published 8 articles, each 8 minutes apart
    When the article list renders
    Then all eight articles form ONE stack
    # (pairwise rule — first→last spanning 56 minutes does not split the run)

  Scenario: A different-feed article interrupts the run
    Given a /feeds/all view showing articles A, B, A, A, A (with B from a different feed)
    When the article list renders
    Then only the trailing three A articles form a stack
    And the first A and B render as individual rows

  Scenario: Expanding the stack
    Given a collapsed stack of 4 articles
    When I click the "+3 more" chevron
    Then the stack expands inline to four article rows
    And keyboard navigation (j/k) walks each row

  Scenario: User opens the top article
    Given a collapsed stack
    When I click anywhere on the top card except the chevron
    Then that article opens in the reader panel
    And the stack stays in its current state (no expand)

  Scenario: User disables grouping in Settings
    Given the "Group article floods" toggle is on
    When I toggle it off in Settings
    Then every existing stack flattens into individual rows
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
2. `ArticleList` reads `useAppStore.groupArticleFloods` and feeds the article
   array through `groupArticles()` (a pure derivation in `useMemo`).
3. `groupArticles()` walks the sorted list once, accumulating a "run" of
   same-feed articles whose adjacent (pairwise) publishedAt deltas all stay
   within `WINDOW_MS`. When the run breaks (different feed, gap > window, or
   bad timestamp), it's flushed: ≥ `MIN_GROUP_SIZE` items become an
   `ArticleGroup` entry, fewer become individual `ArticleEntry` entries.
4. The virtualizer iterates the resulting `ArticleListEntry[]`. Each entry
   renders either as a flat `ArticleItem` or as an `ArticleGroupStack`.
5. `ArticleGroupStack` uses shadcn's `Collapsible` for the expand/collapse
   transition. Collapsed: top card + 1-2 ghost cards behind + chevron button.
   Expanded: all N articles inline + bottom "Collapse" handle.

### Files

| File | Role |
|------|------|
| `src/utils/constants.ts` | `ARTICLE_GROUPING` thresholds (`WINDOW_MS = 10 * 60 * 1000`, `MIN_GROUP_SIZE = 3`); `LOCAL_STORAGE.GROUP_ARTICLE_FLOODS` key |
| `src/lib/group-articles.ts` | Pure `groupArticles()` function + discriminated-union types `ArticleEntry \| ArticleGroup` |
| `src/components/articles/article-group-stack.tsx` | Layered-card collapsed view + inline expanded view, built on shadcn `Collapsible` |
| `src/components/articles/article-list.tsx` | Wraps articles through `groupArticles`, branches the virtualizer's render between `ArticleItem` and `ArticleGroupStack` |
| `src/stores/app-store.ts` | `groupArticleFloods` boolean + `setGroupArticleFloods` setter, hand-rolled localStorage round-trip mirroring the `feedSortMode` pattern in feed-store |
| `src/components/settings/settings-menu.tsx` | "Group article floods" toggle row (both dropdown and sidebar variants) |

### Tests

| File | Coverage |
|------|----------|
| `tests/lib/group-articles.test.ts` | 13 cases: empty, singleton, sub-min, exact-min, long burst pairwise, gap break, cross-feed break, MIN_GROUP_SIZE override, WINDOW_MS=0, publishedAt=0 gate, id stability, order preservation, entry-wrapper shape |
| `tests/components/articles/article-group-stack.test.tsx` | 11 cases: top card rendering, +N chevron, 44×44 touch target, single role=option collapsed, expand reveals N, collapse handle, chevron stopPropagation, top-card onSelect, isSelected prop, feedTitle/favicon, aria-label includes feed name |
| `tests/components/articles/article-list.test.tsx` | New "article grouping" describe: 4 same-feed articles 1-min apart collapse into one role=option with "+3 more". Existing tests reset `groupArticleFloods: false` in `beforeEach` to insulate them from the new default. |
| `tests/stores/app-store.test.ts` | `groupArticleFloods` default-true, setter writes "false"/"true" to localStorage |

## Design Decisions

- **Pairwise gap rule, not window-from-first.** A feed bursting at 8-minute
  intervals for an hour should appear as one stack, not chopped into pieces at
  arbitrary 10-minute marks from each head. The walk only checks the gap
  between adjacent items.
- **MIN_GROUP_SIZE = 3.** Two-article "floods" don't crowd the list noticeably;
  three is where the visual relief from collapsing earns the visual cost of
  the chrome.
- **`publishedAt <= 0` never groups.** Feeds with missing/broken timestamps
  would otherwise have delta=0 and collapse into one giant stack. Hard gate.
- **Stable group id from `feedId + head id + length`.** Survives a `read` flag
  toggle on any inner article (the article references change but the group id
  stays the same → virtualizer reuses the row, `useState(open=…)` survives).
  Changes only if the composition changes (feed-store reload, group splits),
  which intentionally resets the expand state.
- **Chevron is a `<button>` (NOT `role="option"`).** Keyboard nav (`j`/`k`)
  queries `[role="option"]` and clicks the next element. The chevron must not
  appear in that set or `j`/`k` would land on it. Chevron's `stopPropagation`
  prevents its click from bubbling to the top card's `<li>` handler.
- **Top card is a real, memoised `ArticleItem`.** No custom variant — the
  collapsed top card and a flat article render identically, which is the
  cleanest possible visual promise.
- **Expansion state is `useState`, not persisted.** Switching feeds gives a
  new group id, the virtualizer mounts a new component, state resets to
  collapsed. Intentional — no cross-feed memory.
- **Settings toggle lives in `app-store`, not a new `usePrefsStore`.**
  Onboarding-status already lives there; the codebase's localStorage pattern
  is hand-rolled try/catch (no `persist` middleware), so the addition matches.
- **Encryption stays outside the (transactional) DB writes from `importAll`** —
  not relevant to this feature, but the grouping is downstream of the sync
  pull, so any future change to those clear+bulkPut paths must continue to
  not interleave with reads.

## Limitations / future work

- **No aggregate `(N unread)` badge on the top card.** The top card shows
  only its own read state. If a stack has 5 articles and 3 are unread, the
  top card's dot reflects only the head article. v2: extend `ArticleGroup`
  with an `unreadCount` field, render a small chip.
- **Selected article inside a collapsed stack** still scrolls the stack row
  into view, but the user must click the chevron to actually see the inner
  selected article. v2: auto-expand the stack containing the selected id.
- **No `MAX_GROUP_SIZE` cap.** A feed that bursts hundreds of items will
  collapse into one giant stack. Easy one-line addition to `groupArticles`
  if a real user hits this.
- **Mobile touch + active state** — the chevron is 44×44 (min-h-11/min-w-11)
  with `active:scale-95` for press feedback. No swipe-to-expand gesture.

## Manual verification

Run `npm run dev`, open `http://localhost:3000`, subscribe to a flooding feed
such as Hacker News front-page RSS or Reddit `r/all` RSS, and confirm:

1. Stacks form, ghost cards visible behind the top card, "+N more" chevron present.
2. Clicking the top card opens that article in the reader.
3. Clicking the chevron expands inline; clicking "Collapse" at the bottom collapses.
4. Pressing `j`/`k` while collapsed skips top-card-to-top-card.
5. Pressing `j`/`k` while expanded walks each inner article one by one.
6. Toggling Settings → "Group article floods" off immediately flattens; toggling on re-stacks.
7. `/feeds/all` and folder views still group when adjacent same-feed runs appear.
8. Mark-all-read while a stack is expanded — the stack stays expanded; items dim.
