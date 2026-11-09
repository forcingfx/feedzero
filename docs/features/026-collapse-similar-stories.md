# Feature 026: Collapse similar stories

## Status
Implemented

## Summary

A folder that aggregates several news feeds often shows one story three
times, with small title changes. Folder settings gain **Collapse similar
stories** (Off / Loose / Normal / Strict). In that folder's article list,
near-identical headlines fold under the newest copy behind an
**"Also in N more sources"** row; clicking it expands them inline. Opening
the lead marks the folded copies read. Subfolders inherit the setting.
Free. Came from a user email (issue #343) asking for Inoreader-style
duplicate filtering with a selectable similarity.

## Behaviour

```gherkin
Feature: Collapse similar stories

  Scenario: Duplicate stories collapse in a folder
    Given "Collapse similar stories" is Normal for folder "World News"
    And three of its feeds ran near-identical headlines
    When I open the folder
    Then the newest copy shows as one row
    And a row below it reads "Also in 2 more sources"
    And clicking that row shows the other two copies

  Scenario: Choosing how similar counts as a duplicate
    When I set Loose, Normal or Strict in Folder settings
    Then titles must share about 40, 60 or 80 percent of their words to fold

  Scenario: Opening the lead reads the folded copies
    Given a lead with two folded copies
    When I open the lead
    Then the two copies are marked read
    But copies I expanded keep their own read state

  Scenario: Subfolders inherit
    Given "World" is set to Normal and "Europe" is inside it with no setting
    When I open "Europe"
    Then its duplicates fold too

  Scenario: Off by default
    Given a folder with no setting
    Then every copy shows, as before
```

## Architecture

### Flow

1. `ArticleList` reads the viewed folder id from the `folder:` feed id and
   resolves `collapseSimilar` with `inheritedFolderValue` (nearest ancestor
   that sets it).
2. `collapseSimilarStories(visibleArticles, level)` walks the
   publishedAt-descending list once. Each article joins the first story
   whose *lead* title overlaps enough (Jaccard over `tokenize()` tokens,
   0.4 / 0.6 / 0.8), else starts a story. Titles with no tokens never fold.
3. The list renders leads; flood grouping (feature 013) runs on leads. Any
   rendered lead with folded copies is followed by a `SimilarStoriesRow`
   (collapsed) or by its copies and a collapse row (expanded).
4. `handleSelect` on a lead whose copies are collapsed calls
   `markAsRead` for each copy.

### Files

| File | Role |
|------|------|
| `src/lib/collapse-similar-stories.ts` | The fold; `SIMILARITY_THRESHOLD` |
| `src/core/signal/tokenize.ts` | `tokenize`, `jaccard` (shared with Signal) |
| `src/core/feeds/folder-tree.ts` | `inheritedFolderValue` |
| `src/components/articles/article-list.tsx` | Leads, flood grouping on leads, summary rows, read cascade |
| `src/components/articles/similar-stories-row.tsx` | The "Also in N more sources" / "Collapse" row |
| `src/components/folders/folder-settings-dialog.tsx` | The setting |
| `src/stores/feed-store.ts` | `setFolderCollapseSimilar` |
| `packages/core/src/types/index.ts` | `SimilarityLevel`, `Folder.collapseSimilar` |

### Tests

| File | Coverage |
|------|----------|
| `tests/lib/collapse-similar-stories.test.ts` | Fold rule, three levels, empty titles, order |
| `tests/core/feeds/inherited-folder-value.test.ts` | Inheritance, missing folder, cycle |
| `tests/integration/folder-collapse-similar.test.tsx` | Setting persists through the real encrypted db |
| `tests/components/articles/article-list-similar-stories.test.tsx` | Fold, expand/collapse, read cascade, inheritance, off by default |

## Design Decisions

- **Collapse under the newest copy, never hide** (owner, 2026-11-09). The
  folded copies stay one click away, like flood groups.
- **Compare against the lead only**, unlike Signal's `groupIntoStories`,
  which merges token sets as a story grows. Merging lets a chain of
  loosely related headlines drift into one story; a per-folder reading
  list needs the opposite bias.
- **Per folder, not app-wide.** Duplicates are a property of how a folder
  is composed (several outlets on one beat). A tech-blog folder has none.
- **Opening the lead reads the copies** (owner, 2026-11-09): the user has
  seen the story. Expanded copies are visible rows with their own state.
- **Free.** Only the Link rule condition that mutes YouTube Shorts sits
  behind the paid Rules feature.

## Limitations

- English-biased: the tokenizer's stopword list is English, so other
  languages fold less reliably.
- Title-only. Two outlets with very different headlines for one event
  stay separate.
- Flood groups and similar stories compose, but a folded copy inside a
  collapsed flood is only reachable by expanding the flood first.
