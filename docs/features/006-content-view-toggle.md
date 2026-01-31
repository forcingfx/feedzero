# Feature 006: Content View Toggle

## Status
Implemented

## Summary

Articles can be viewed in three modes: Feed (original RSS content), Extracted (Defuddle full-text, fetched on demand), and Summary (teaser/description). The toggle intelligently hides redundant modes based on content similarity, showing only relevant options. When a single mode remains, the toggle bar is hidden entirely.

## Behaviour

```gherkin
Feature: Content view toggle

  Scenario: Default view shows feed content
    Given the user selects an article
    Then the article displays in "Feed" mode
    And the feed-provided content is shown

  Scenario: User extracts full text
    Given the user is viewing an article with a valid link
    When the user clicks the "Extracted" button
    Then the article page is fetched and extracted
    And the extracted content is displayed
    And subsequent clicks show the cached result instantly

  Scenario: Summary hidden when similar to feed
    Given an article where the summary is the beginning of the feed content
    Then the "Summary" button is not shown

  Scenario: No summary available
    Given an article with no summary field
    Then the "Summary" button is not shown

  Scenario: Extracted hidden when feed provides full content
    Given an article where the feed provides both content and summary
    And content is longer than summary (publisher included full article)
    Then the "Extracted" button is not shown

  Scenario: Extracted content matches feed (post-extraction)
    Given an article where extraction produces similar content to the feed
    When extraction completes
    Then the "Extracted" button is removed
    And the view snaps back to "Feed" mode

  Scenario: Only one mode available
    Given an article with content but no summary and no valid link
    Then no toggle bar is displayed
    And feed content is shown directly

  Scenario: Timestamps display with time
    Given an article with a publishedAt date
    Then the meta line shows date and time up to minutes
    And seconds are not displayed
```

## Architecture

### Flow

1. `setArticle(article)` resets to "feed" mode
2. `#getAvailableModes()` computes which buttons to show:
   - "feed" — always available
   - "summary" — only if summary exists and differs from feed content (containment check on first 150/300 chars)
   - "extracted" — only if feed content looks incomplete (content not longer than summary) AND valid HTTP link exists AND (not yet cached, or cached and differs from feed)
3. `#render()` shows toggle bar only if `availableModes.length > 1`
4. Clicking "Extracted" triggers `#fetchExtracted()` — fetches, extracts, caches, checks similarity
5. `#contentsSimilar(a, b)` strips HTML, normalizes whitespace, checks if shorter text's first 150 chars appear within longer's first 300 chars

### Files

| File | Role |
|------|------|
| `src/ui/components/article-view.js` | Toggle UI, smart mode computation, on-demand extraction, similarity check, caching |

### Tests

| File | Coverage |
|------|----------|
| `tests/ui/components/article-view.test.js` | 11 tests: empty state, content render, toggle hidden (no summary/no link), summary hidden (similar), summary shown (different), timestamp with time, extracted hidden (full content), extracted shown (short content), XSS escape, fallback content, reset |

## Design Decisions

- **User-initiated extraction** — Extraction only happens when the user clicks "Extracted". No automatic extraction on add/refresh. This is faster and avoids surprises with discussion pages, PDFs, or JS-heavy sites.
- **Smart mode hiding** — Redundant modes are hidden to avoid confusing the user with identical content under different labels. The similarity heuristic uses a containment check (shorter text's first 150 chars within longer's first 300 chars) rather than exact prefix matching, tolerating minor differences from DOMPurify sanitization.
- **Content completeness heuristic** — If the feed provides both `content` and `summary` and content is longer, the publisher included the full article. "Extracted" is not offered regardless of absolute length. This works for both long articles (11,500 chars) and short sponsor posts (~600 chars).
- **In-memory cache** — Extracted content is cached in a Map keyed by article link. The cache lives in the component instance and is lost on page reload. This avoids DB writes for transient extraction results.
- **Timestamps with time** — Uses `toLocaleString()` with system locale, showing year, month, day, hour, minute. Seconds are excluded for cleaner display.

## Limitations

- Extracted content cache is in-memory only — lost on page reload
- Similarity containment check may have edge cases with very similar but distinct articles
- Content completeness heuristic assumes content > summary means full article — could be wrong for feeds that provide a medium-length excerpt in content:encoded
- No keyboard shortcut to cycle through view modes
