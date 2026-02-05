# Feature 001: Add and Parse Feeds

## Status
Implemented

## Summary

Users can add a feed by URL. The app fetches the feed, detects its format, parses it, and displays articles.

## Supported Formats

- RSS 2.0
- Atom 1.0
- JSON Feed 1.1

## Behaviour

```gherkin
Feature: Add a feed URL and display its articles

  Scenario: Valid Atom feed URL
    Given the user has no feeds
    When the user enters a valid Atom feed URL and submits
    Then the app fetches the feed via the CORS proxy
    And the feed appears in the feed list with its title
    And the feed is selected automatically
    And the article list shows article titles from the feed

  Scenario: Valid JSON Feed URL
    Given the user has no feeds
    When the user enters a valid JSON Feed URL and submits
    Then the app fetches the feed via the CORS proxy
    And the JSON Feed is parsed successfully
    And the feed appears in the feed list with its title
    And the article list shows article titles from the feed

  Scenario: Empty URL rejected
    When the user submits the add-feed form with an empty input
    Then the form is not submitted (HTML5 required validation)

  Scenario: Invalid URL rejected
    When the user enters "not-a-url" and submits
    Then the form is not submitted (HTML5 type=url validation)

  Scenario: Unreachable URL
    When the user enters a valid URL that returns a network error
    Then an error message is shown in the feed list panel

  Scenario: URL returns non-feed content
    When the user enters a URL that returns HTML (not a feed)
    Then an error message is shown: parse/validation error

  Scenario: Duplicate feed URL
    Given a feed with the same URL already exists
    When the user enters the same URL and submits
    Then an error message is shown indicating the feed already exists

  Scenario: Feed selected shows articles
    Given a feed has been added with articles
    When the user clicks the feed in the feed list
    Then the article list displays article titles sorted by date (newest first)

  Rule: Keyboard shortcut opens add feed form

  Scenario: Add feed via keyboard
    When the user presses "N"
    Then the add feed form opens in the sidebar
    And the URL input is focused

  Scenario: Submit feed URL and auto-navigate
    Given the add feed form is open
    When the user enters a valid feed URL and presses Enter
    Then the feed is added
    And the new feed is selected automatically
    And the URL navigates to /feeds/:feedId
    And the article list shows the new feed's articles
```

## Architecture

### Flow

1. `<feed-list>` emits `feed:added` with URL via event bus
2. `main.js` calls `addFeedFlow(url)` from `feed-service.js`
3. `feed-service.js` checks for duplicate URL via `feedExistsByUrl()` index query
3a. If URL exists but can't be decrypted (orphan from old session), removes orphan and proceeds
4. Fetches via `/api/feed?url=<encoded>` (CORS proxy)
5. `validator.js` detects format: tries JSON parse first, then XML
6. `parser.js` routes to `parseRss()`, `parseAtom()`, or `parseJsonFeed()`
7. Content sanitized by DOMPurify
8. Feed and articles created via `schema.js`, encrypted, stored via `db.js`
9. Returns `Result<{feed, articles}>` to `main.js`
10. `main.js` refreshes feed list and auto-selects the new feed

### Files

| File | Role |
|------|------|
| `src/core/feeds/feed-service.js` | Orchestrates the full add-feed flow |
| `src/core/parser/validator.js` | Detects RSS 2.0, Atom 1.0, or JSON Feed 1.1 |
| `src/core/parser/parser.js` | Parses all three formats into `{feed, articles}`. Decodes double-encoded HTML entities from malformed feeds. |
| `src/core/parser/sanitizer.js` | DOMPurify wrapper for HTML content |
| `src/stores/feed-store.ts` | `addFeed()` action, auto-selects new feed |
| `src/components/feeds/add-feed-form.tsx` | Add-feed form, calls `onFeedSelect` after success |
| `src/components/layout/app-sidebar.tsx` | Listens for `feedzero:add-feed` event (N key) |
| `src/hooks/use-keyboard-nav.ts` | N key dispatches add-feed event |
| `vite.config.js` | Dev-only CORS proxy plugin |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/parser/parser.test.js` | RSS, Atom, and JSON Feed parsing, double-encoded entity handling (19 tests) |
| `tests/core/parser/validator.test.js` | Format detection (5 tests) |
| `tests/core/feeds/feed-service.test.js` | Full flow, error messages, orphan cleanup, duplicates (11 tests) |
| `tests/core/storage/db.test.js` | Index-level duplicate detection, ConstraintError handling (3 tests) |

## Design Decisions

- **CORS proxy as Vite plugin** — Simplest dev-time solution. No npm dependency. Production proxy is a separate concern.
- **JSON Feed detection before XML** — `validator.js` checks for `{` prefix and parses JSON first. Avoids feeding JSON into DOMParser which produces confusing XML errors.
- **Duplicate check via index** — Uses `feedExistsByUrl()` to query the plaintext `url` index directly, avoiding decryption of all feeds. `addFeed()` also catches `ConstraintError` as a fallback.
- **Auto-select after add** — Immediately shows the user the articles they just subscribed to.

## Error Handling

All errors shown to the user are human-readable. Internal errors from the XML parser, validator, and network layer are translated in `feed-service.js` via `friendlyError()`:

| Internal error | User sees |
|---------------|-----------|
| `Invalid XML: ...` | "This URL is not a valid feed. Please check the URL and try again." |
| `Unrecognized feed format: <html>` | Same as above |
| HTTP 404/500 from fetch | "The feed at this URL could not be reached (HTTP 404)." |
| Network failure (fetch throws) | "The feed at this URL could not be reached. Please check your connection and try again." |
| Duplicate URL | "A feed with this URL already exists" |

## Limitations

- No feed refresh/polling yet
- No error recovery for partially failed article storage
- CORS proxy is dev-only — production deployment needs its own solution
- Default passphrase — no user-supplied passphrase prompt yet
