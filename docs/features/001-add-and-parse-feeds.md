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
```

## Architecture

### Flow

1. `<feed-list>` emits `feed:added` with URL via event bus
2. `main.js` calls `addFeedFlow(url)` from `feed-service.js`
3. `feed-service.js` checks for duplicate URL in existing feeds
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
| `src/core/parser/parser.js` | Parses all three formats into `{feed, articles}` |
| `src/core/parser/sanitizer.js` | DOMPurify wrapper for HTML content |
| `src/main.js` | Wires FEED_ADDED event to feed-service, handles auto-select |
| `src/ui/components/feed-list.js` | Add-feed form, feed list display, error display |
| `vite.config.js` | Dev-only CORS proxy plugin |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/parser/parser.test.js` | RSS, Atom, and JSON Feed parsing (14 tests) |
| `tests/core/parser/validator.test.js` | Format detection (5 tests) |
| `tests/core/feeds/feed-service.test.js` | Full flow with mocked fetch/db (6 tests) |

## Design Decisions

- **CORS proxy as Vite plugin** — Simplest dev-time solution. No npm dependency. Production proxy is a separate concern.
- **JSON Feed detection before XML** — `validator.js` checks for `{` prefix and parses JSON first. Avoids feeding JSON into DOMParser which produces confusing XML errors.
- **Duplicate check before fetch** — Avoids wasting a network request on a feed that already exists.
- **Auto-select after add** — Immediately shows the user the articles they just subscribed to.

## Limitations

- No feed refresh/polling yet
- No error recovery for partially failed article storage
- CORS proxy is dev-only — production deployment needs its own solution
- Default passphrase — no user-supplied passphrase prompt yet
