# Feature 003: Full-Text Extraction

## Status
Implemented

## Summary

Feeds that only provide a short summary (no `content:encoded` or `content_html`) now have their articles' full text extracted from the linked web page using Defuddle. The extractor architecture is pluggable — swap one import to use a different library (e.g. Readability).

## Behaviour

```gherkin
Feature: Full-text extraction (user-initiated)

  Scenario: User requests extracted content
    Given an article is displayed in the article view
    When the user clicks the "Extracted" toggle button
    Then the article's linked page is fetched via /api/page
    And Defuddle extracts readable content from the HTML
    And extracted content is cleaned up and displayed
    And the result is cached for subsequent views

  Scenario: Extracted content matches feed content
    Given an article where feed content is already complete
    When the user clicks "Extracted" and content is similar
    Then the view snaps back to "Feed" mode
    And the "Extracted" button is hidden

  Scenario: Page fetch fails
    Given an article whose page is unreachable
    When the user clicks "Extracted"
    Then an error message is shown in the content area
    And the user can switch back to "Feed" view
```

## Architecture

### Flow

1. User clicks "Extracted" button in `<article-view>`
2. `article-view.js` fetches the article's page via `/api/page?url=...`
3. Checks Content-Type is HTML (rejects PDFs, images, etc.)
4. Passes HTML to `extract()` → Defuddle parses DOM → `cleanExtractedContent()` removes empty elements/collapses `<br>` tags → DOMPurify sanitizes
5. Result is cached in a Map (link → HTML) in article-view for instant re-access
6. If extracted content is similar to feed content (first 200 chars match), the "Extracted" button is removed and view snaps back to "Feed"
7. `needsExtraction()` still exists as a heuristic for programmatic use

### Files

| File | Role |
|------|------|
| `src/core/extractor/extractor.js` | Public API: `extract()` delegates to implementation, `needsExtraction()` heuristic |
| `src/core/extractor/defuddle-extractor.js` | Defuddle wrapper: HTML → DOMParser → Defuddle → cleanup → sanitize → Result |
| `src/core/extractor/cleanup.js` | `cleanExtractedContent(html)` — removes empty elements, collapses `<br>` tags |
| `src/ui/components/article-view.js` | Triggers extraction on user click, caches results, similarity check |
| `vite.config.js` | `/api/page` proxy endpoint (reuses `proxyHandler()` from `/api/feed`) |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/extractor/extractor.test.js` | 7 tests: needsExtraction heuristic (full content, empty, missing, identical, no link, non-HTTP, distinct short) |
| `tests/core/extractor/defuddle-extractor.test.js` | 6 tests: content extraction, nav/footer stripping, title extraction, XSS sanitization, empty input, non-HTML |
| `tests/core/extractor/cleanup.test.js` | 9 tests: empty elements, consecutive BRs, null input, structure preservation |
| `tests/ui/components/article-view.test.js` | 9 tests: toggle visibility, smart mode hiding, timestamp format |

## Design Decisions

- **Browser User-Agent on `/api/page`** — Article-page fetches use a Firefox UA, not the `FeedZero/1.0 (RSS Reader)` identifier used for feed fetches. Cloudflare-class WAFs block bot-looking UAs on article URLs (where bot traffic isn't expected) while allowing them on feed URLs (where it is). Without the split, extraction on widely-deployed sites — kottke.org, zeit.de, others — fails silently because the upstream serves a challenge page that Defuddle can't extract. Policy lives in `src/core/proxy/pick-user-agent.ts`; the handler reads it via `options.routeKind` in `proxy-handler.ts`.
- **Auto-detect, don't always extract** — Feeds that provide full content (like Spyglass) already have excellent HTML. Running extraction over it would strip author-intended elements and degrade quality.
- **500-char threshold** — Articles with content shorter than 500 chars where content equals summary are treated as teasers. Genuinely short articles with distinct content are left alone.
- **User-initiated extraction** — Extraction is triggered by clicking "Extracted" in the content view toggle, not automatically on add/refresh. This is faster and avoids surprises with discussion sites or PDFs.
- **Content similarity check** — After extraction, if the extracted text is similar to the feed content (first 200 chars match), the "Extracted" button is hidden and the view snaps back to "Feed". Avoids showing duplicate content.
- **Post-extraction cleanup** — `cleanExtractedContent()` removes empty `<p>`, `<div>`, `<span>`, `<a>` elements and collapses consecutive `<br>` tags. Runs via DOM manipulation, not regex.
- **Non-fatal extraction** — If page fetch or extraction fails, an error message is shown. The user can switch back to "Feed" view.
- **Pluggable architecture** — `extractor.js` imports from `defuddle-extractor.js`. Swapping to Readability means writing `readability-extractor.js` and changing one import line.
- **Content-Type check** — Rejects non-HTML responses (PDFs, images) before passing to Defuddle.

## Limitations

- Extraction quality depends on page structure — sites with heavy JavaScript rendering may produce poor results (Defuddle operates on static HTML)
- Extracted content is cached in memory (article-view Map), not persisted to DB
- Dev-only proxy — production deployment needs a real server-side proxy for `/api/page`
