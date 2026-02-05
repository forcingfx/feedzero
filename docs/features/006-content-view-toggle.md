# Feature 006: Content View Toggle

## Status
Implemented

## Summary

Articles can be viewed in two modes: Feed (original RSS content) and Extracted (Defuddle full-text, fetched on demand). When an article's summary is distinct from its feed content, it is displayed as a styled subheading above the feed content rather than as a separate tab. The toggle intelligently hides redundant modes based on content similarity and completeness, showing only relevant options. When a single mode remains, the toggle bar is hidden entirely.

## Behaviour

```gherkin
Feature: Content view toggle

  Rule: Feed mode is always shown as the default

  Scenario: Viewing an article
    Given the user selects an article
    Then the article displays in "Feed" mode

  Rule: Distinct summary is shown as inline subheading

  Scenario: Summary is similar or absent
    Given an article with no summary, or where summary overlaps with feed content
    Then no summary subheading is displayed

  Scenario: Summary is distinct
    Given an article where the summary text differs from feed content
    Then the summary is displayed as a styled subheading above the feed content
    And no "Summary" toggle button is shown

  Rule: Extracted is shown only when the feed lacks full content

  Scenario: Feed provides full content (content longer than summary)
    Given an article where the feed provides content longer than the summary
    Then the "Extracted" button is not shown

  Scenario: Description-only feed with substantial content
    Given an article where content and summary are identical (description-only feed)
    And the content has 100 or more words
    Then the "Extracted" button is not shown

  Scenario: Description-only feed with short content
    Given an article where content and summary are identical
    And the content has fewer than 100 words
    Then the "Extracted" button is shown

  Scenario: Feed has only a teaser
    Given an article with a valid link and no full content from the feed
    When the user clicks "Extracted"
    Then the article page is fetched, extracted, and displayed
    And the result is cached for subsequent views
    And if extracted content is not meaningfully richer, snaps back to feed view

  Rule: Extraction must be meaningfully richer to be shown

  Scenario: Extraction adds substantial content
    Given extracted content has 100+ more words AND 50%+ word increase over feed
    Then the extracted content is shown

  Scenario: Extraction adds only boilerplate
    Given extracted content does not meet the word increase thresholds
    Then the view snaps back to feed mode

  Rule: Toggle bar is hidden when only Feed remains

  Scenario: Single mode
    Given an article where Summary and Extracted are both unavailable
    Then no toggle bar is displayed

  Rule: Timestamps show date and time

  Scenario: Timestamps display with time
    Given an article with a publishedAt date
    Then the meta line shows date and time up to minutes
    And seconds are not displayed

  Rule: Keyboard shortcut toggles view mode

  Scenario: Toggle view with E key
    Given an article is selected in Feed view
    When the user presses "E"
    Then the view switches to Extracted mode
    And the full article is fetched and displayed

  Scenario: Toggle back with E key
    Given an article is displayed in Extracted view
    When the user presses "E"
    Then the view switches back to Feed mode

  Scenario: E key uses cached extraction
    Given an article's extracted content is already cached
    When the user presses "E"
    Then the cached content is displayed immediately
    And no network request is made
```

## Architecture

### Flow

1. `setArticle(article)` resets to "feed" mode
2. `getAvailableModes()` (from `content-modes.js`) computes which buttons to show using:
   - `hasFullContent` — true when content is longer than summary, OR when content equals summary (description-only feed) with 100+ words
   - `hasExtractableLink` — article has a valid HTTP link
   - `isExtractionMeaningful()` — for cached extractions, requires 100+ more words AND 50%+ word increase
3. `hasSummarySubheading()` determines if the summary should render as an inline subheading above feed content (both exist and are distinct)
4. `#render()` shows toggle bar only if `availableModes.length > 1`
5. Clicking "Extracted" triggers `#fetchExtracted()` — fetches, extracts, caches, checks if meaningful
6. `textsSimilar(a, b)` checks if the shorter text's first 150 chars appear within the longer's first 300 chars
7. `isExtractionMeaningful(feedText, extractedText)` — requires both absolute (100+ words) and relative (50%+) increase to filter boilerplate

### Files

| File | Role |
|------|------|
| `src/lib/content-modes.ts` | Pure functions: `getAvailableModes()`, `hasSummarySubheading()`, `isExtractionMeaningful()`, `textsSimilar()`, `stripHtml()` |
| `src/components/reader/reader-panel.tsx` | Toggle UI, on-demand extraction, rendering |
| `src/components/reader/view-toggle.tsx` | Toggle button group component |
| `src/stores/extraction-store.ts` | View mode state, extraction cache, `toggleViewMode()` action |
| `src/hooks/use-keyboard-nav.ts` | E key handler calls `toggleViewMode()` |

### Tests

| File | Coverage |
|------|----------|
| `tests/ui/components/content-modes.test.js` | 26 tests: stripHtml, textsSimilar, getAvailableModes, hasSummarySubheading, isExtractionMeaningful |
| `tests/stores/extraction-store.test.ts` | 12 tests: view mode, fetch/cache, toggleViewMode, switchToExtracted |
| `tests/hooks/use-keyboard-nav.test.tsx` | E key toggle tests (3 tests): triggers fetch, uses cache, handles no article |
| `tests/integration/view-toggle-parity.test.tsx` | 5 tests: keyboard vs click behavior parity |

## Design Decisions

- **Isolated mode logic** — Mode computation is extracted into `content-modes.js` as pure functions. No DOM component setup needed for testing. The heuristic rules are auditable in one place.
- **User-initiated extraction** — Extraction only happens when the user clicks "Extracted". No automatic extraction on add/refresh. This is faster and avoids surprises with discussion pages, PDFs, or JS-heavy sites.
- **Smart mode hiding** — Redundant modes are hidden to avoid confusing the user with identical content under different labels. The similarity heuristic uses a containment check rather than exact prefix matching, tolerating minor differences from DOMPurify sanitization.
- **Content completeness heuristic** — Full content is detected in two ways: (1) content is longer than summary (publisher included the full article), or (2) content and summary are identical with 100+ words (description-only feed like Kottke.org, where the full article lives in `<description>` without `<content:encoded>`). This works for long articles, short sponsor posts, and description-only feeds.
- **Extraction quality gate** — After extraction, `isExtractionMeaningful()` requires both 100+ additional words AND a 50%+ word count increase. This dual threshold filters out extractions that only added boilerplate, navigation, or comments. A short feed (50 words) with a rich extraction (300 words) passes; a full article (300 words) with minor boilerplate additions (400 words, 33%) does not.
- **In-memory cache** — Extracted content is cached in a Map keyed by article link. The cache lives in the component instance and is lost on page reload. This avoids DB writes for transient extraction results.
- **Timestamps with time** — Uses `toLocaleString()` with system locale, showing year, month, day, hour, minute. Seconds are excluded for cleaner display.

## Limitations

- Extracted content cache is in-memory only — lost on page reload
- Similarity containment check may have edge cases with very similar but distinct articles
- The 100-word threshold for description-only feeds is a heuristic — some feeds may have substantive short posts (< 100 words) that get incorrectly offered extraction
- Extraction quality thresholds (100 words, 50%) are tunable but not user-configurable
