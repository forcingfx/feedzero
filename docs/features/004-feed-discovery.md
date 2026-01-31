# Feature 004: Feed Discovery and Flexible URL Input

## Status
Implemented

## Summary

Users can enter URLs in any format — bare domains (`nytimes.com`), with or without scheme, with or without trailing slashes. If the URL is a website rather than a feed, the app automatically discovers the site's RSS feed through a multi-strategy cascade.

## Behaviour

```gherkin
Feature: Flexible feed URL input

  Scenario: User enters a direct feed URL
    Given the user types "https://spyglass.org/rss/"
    When they press Enter or click Add
    Then the feed is added directly

  Scenario: User enters a bare domain
    Given the user types "spyglass.org"
    When they press Enter
    Then the app prepends https:// and discovers the feed

  Scenario: User enters a website URL with autodiscovery
    Given the website has <link rel="alternate" type="application/rss+xml"> in its HTML
    When the user enters the website URL
    Then the app finds and adds the linked feed

  Scenario: User enters a website URL without autodiscovery
    Given the website has no <link> tags but has a feed at /feed or /rss
    When the user enters the website URL
    Then the app probes well-known paths and adds the feed

  Scenario: No feed can be found
    Given the URL points to a site with no discoverable feed
    When the user enters the URL
    Then the app shows "This URL is not a valid feed" error
```

## Architecture

### Discovery cascade

When direct parsing fails, `discoverFeed()` runs these strategies in order:

1. **HTML `<link>` autodiscovery** — Parse page `<head>` for `<link rel="alternate">` with RSS/Atom/JSON Feed MIME types
2. **Well-known paths** — Try `/feed`, `/rss`, `/atom.xml`, `/feed.xml`, `/rss.xml`, `/index.xml`, `/feed.json`, `/rss/`, `/feed/`, `/?feed=rss2` against the site's origin
3. **Anchor link scanning** — Scan `<a>` tags for hrefs containing keywords: `rss`, `feed`, `atom`, `xml`

Each strategy returns candidate URLs. The cascade stops at the first URL that parses as a valid feed.

### URL normalization

`normalizeUrl()` handles:
- Bare domains: `nytimes.com` → `https://nytimes.com`
- Missing scheme: `www.example.com/rss` → `https://www.example.com/rss`
- Trailing slashes: `/rss/` → `/rss` (for consistent duplicate detection)
- Case: `HTTPS://EXAMPLE.COM` → `https://example.com`

### Enter key fix

Changed `<input type="url">` to `<input type="text" inputmode="url">`. Browser URL validation was blocking form submission for bare domains. `inputmode="url"` preserves the URL keyboard on mobile without validation.

### Files

| File | Role |
|------|------|
| `src/core/discovery/discovery.js` | Public API: `discoverFeed(url)` runs the cascade |
| `src/core/discovery/strategies.js` | Pure functions: `findFeedLinksInHtml()`, `getWellKnownFeedUrls()`, `findFeedLinksInAnchors()` |
| `src/core/feeds/feed-service.js` | Enhanced `normalizeUrl()`, `addFeedFlow()` calls discovery on parse failure |
| `src/ui/components/feed-list.js` | Input type changed for Enter key support |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/discovery/strategies.test.js` | 14 tests: RSS/Atom/JSON Feed link detection, relative hrefs, multiple feeds, well-known paths, anchor scanning |
| `tests/core/discovery/discovery.test.js` | 5 tests: discovery via HTML link, well-known path, anchor, no feed found, page fetch failure |
| `tests/core/feeds/feed-service.test.js` | 6 new tests: normalizeUrl bare domain/scheme/www, discovery integration |

## Design Decisions

- **Cascade order** — HTML autodiscovery first (most reliable), then well-known paths (broad coverage), then anchors (last resort). Each is progressively more speculative.
- **Store discovered URL, not input URL** — If user enters `nytimes.com` and we discover `/feed.xml`, we store the feed URL. This prevents re-discovery on reload and enables accurate duplicate detection.
- **No sitemap parsing** — Too slow and complex for low yield.
- **No third-party services** — Privacy principle: no external calls beyond what the user explicitly requested.
- **Sequential probing** — Well-known paths are tried one at a time to avoid hammering servers. Could be parallelized later if speed is a concern.

## Limitations

- Well-known path probing makes up to 10 HTTP requests per discovery attempt
- No caching of discovery results — re-entering a website URL re-runs the cascade
- Some sites may require JavaScript rendering to expose feed links (not supported)
