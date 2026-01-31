# Feature 006: Content View Toggle

## Status
Implemented

## Summary

Articles can be viewed in three modes: Feed (original RSS content), Extracted (Defuddle full-text, fetched on demand), and Summary (teaser/description). The toggle intelligently hides redundant modes based on content similarity and completeness, showing only relevant options. When a single mode remains, the toggle bar is hidden entirely.

## Behaviour

```gherkin
Feature: Content view toggle

  Rule: Feed mode is always shown as the default

  Scenario: Viewing an article
    Given the user selects an article
    Then the article displays in "Feed" mode

  Rule: Summary is shown only when it differs from Feed content

  Scenario: Summary is similar or absent
    Given an article with no summary, or where summary overlaps with feed content
    Then the "Summary" button is not shown

  Scenario: Summary is distinct
    Given an article where the summary text differs from feed content
    Then the "Summary" button is shown

  Rule: Extracted is shown only when the feed lacks full content

  Scenario: Feed provides full content (content longer than summary)
    Given an article where the feed provides content longer than the summary
    Then the "Extracted" button is not shown

  Scenario: Feed has only a teaser
    Given an article with a valid link and no full content from the feed
    When the user clicks "Extracted"
    Then the article page is fetched, extracted, and displayed
    And the result is cached for subsequent views
    And if extracted content matches feed content, the button is removed

  Rule: Toggle bar is hidden when only Feed remains

  Scenario: Single mode
    Given an article where Summary and Extracted are both unavailable
    Then no toggle bar is displayed

  Rule: Timestamps show date and time

  Scenario: Timestamps display with time
    Given an article with a publishedAt date
    Then the meta line shows date and time up to minutes
    And seconds are not displayed
```

## Architecture

### Flow

1. `setArticle(article)` resets to "feed" mode
2. `getAvailableModes()` (from `content-modes.js`) computes which buttons to show using three named checks:
   - `hasDistinctSummary` — summary exists and its text is not contained within feed content
   - `hasFullContent` — feed provides both content and summary, and content is longer
   - `hasExtractableLink` — article has a valid HTTP link
3. `#render()` shows toggle bar only if `availableModes.length > 1`
4. Clicking "Extracted" triggers `#fetchExtracted()` — fetches, extracts, caches, checks similarity
5. `textsSimilar(a, b)` checks if the shorter text's first 150 chars appear within the longer's first 300 chars

### Files

| File | Role |
|------|------|
| `src/ui/components/content-modes.js` | Pure functions: `getAvailableModes()`, `textsSimilar()`, `stripHtml()` |
| `src/ui/components/article-view.js` | Toggle UI, on-demand extraction, rendering, caching |

### Tests

| File | Coverage |
|------|----------|
| `tests/ui/components/content-modes.test.js` | 10 tests: stripHtml (tags, null, alt text), textsSimilar (match, no match, empty), getAvailableModes (feed-only, summary shown/hidden, extracted shown/hidden, cached similar/different) |
| `tests/ui/components/article-view.test.js` | 11 tests: empty state, content render, toggle hidden, summary hidden/shown, timestamp, extracted hidden/shown, XSS escape, fallback, reset |

## Design Decisions

- **Isolated mode logic** — Mode computation is extracted into `content-modes.js` as pure functions. No DOM component setup needed for testing. The heuristic rules are auditable in one place.
- **User-initiated extraction** — Extraction only happens when the user clicks "Extracted". No automatic extraction on add/refresh. This is faster and avoids surprises with discussion pages, PDFs, or JS-heavy sites.
- **Smart mode hiding** — Redundant modes are hidden to avoid confusing the user with identical content under different labels. The similarity heuristic uses a containment check rather than exact prefix matching, tolerating minor differences from DOMPurify sanitization.
- **Content completeness heuristic** — If the feed provides both `content` and `summary` and content is longer, the publisher included the full article. "Extracted" is not offered regardless of absolute length. This works for both long articles (11,500 chars) and short sponsor posts (~600 chars).
- **In-memory cache** — Extracted content is cached in a Map keyed by article link. The cache lives in the component instance and is lost on page reload. This avoids DB writes for transient extraction results.
- **Timestamps with time** — Uses `toLocaleString()` with system locale, showing year, month, day, hour, minute. Seconds are excluded for cleaner display.

## Limitations

- Extracted content cache is in-memory only — lost on page reload
- Similarity containment check may have edge cases with very similar but distinct articles
- Content completeness heuristic assumes content > summary means full article — could be wrong for feeds that provide a medium-length excerpt in content:encoded
- No keyboard shortcut to cycle through view modes
