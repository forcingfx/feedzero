# Feature 020: Bridges — Non-RSS Sources as Feeds

## Status
Implemented (MVP: Reddit, GitHub, Mastodon, YouTube).

## Summary

Bridges let users follow sources that don't look like feeds — a YouTube
channel, a subreddit, a Mastodon profile, a GitHub repo — by pasting the normal
source URL into "Add feed". A bridge maps the URL to the **native feed each
source already publishes** (no scraping). Personal-tier feature; see ADR 021
for why this is URL translation, not the rss-bridge scraping model.

## Behaviour

```gherkin
Feature: Bridges

  Scenario: Add a subreddit by its URL
    Given the user is on Personal tier (or paid tier inactive)
    When they add "https://www.reddit.com/r/selfhosted"
    Then the feed resolves to "https://www.reddit.com/r/selfhosted/.rss"
    And articles load as for any feed

  Scenario: Add a YouTube channel by @handle
    Given the user adds "https://www.youtube.com/@LinusTechTips"
    When discovery runs the YouTube bridge
    Then the page is fetched once to recover the channelId
    And the feed resolves to ".../feeds/videos.xml?channel_id=UC…"

  Scenario: Bridge gate is off (Free tier, paid tier active)
    When a Free user adds a subreddit URL
    Then bridges do not run; normal HTML discovery applies
    And the subreddit's native HTML <link> autodiscovery may still resolve it

  Scenario: Wrong bridge guess
    Given a non-Mastodon "/@user" URL slips past the host denylist
    When the bridge proposes "<origin>/@user.rss"
    Then tryParseFeed fails to parse it
    And discovery falls through to the page-based strategies
```

## Architecture

### Flow

1. User adds a URL. `addFeedFlow` fetches `/api/feed` and tries `parse()`.
2. If it parses, it's already a feed — done (bridges never run for real feeds).
3. If not, `discoverFeed(url, { bridges })` runs. The `bridges` boolean is the
   Personal-tier `gateState("bridges", …)` result, resolved in `feed-store`
   and threaded down (core stays store-agnostic).
4. **Strategy 0 — bridges:** `resolveBridgeFeedUrl(url)` picks the first
   matching bridge and returns a candidate feed URL. `tryParseFeed` validates
   it; on success, discovery returns immediately (no page fetch).
5. Otherwise the existing strategies run: HTML `<link>` autodiscovery,
   well-known paths, anchor scanning.

### Files

| File | Role |
|------|------|
| `src/core/bridges/types.ts` | `Bridge` interface (`matches`, `toFeedUrl`). |
| `src/core/bridges/registry.ts` | Ordered first-match registry. |
| `src/core/bridges/{reddit,github,mastodon,youtube}.ts` | One bridge each. |
| `src/core/bridges/index.ts` | `resolveBridgeFeedUrl()` + registration order. |
| `src/core/discovery/discovery.ts` | Strategy 0 wiring + `{ bridges }` option. |
| `src/core/feeds/feed-service.ts` | `addFeedFlow` threads `bridgesEnabled`. |
| `src/stores/feed-store.ts` | Resolves the `bridges` gate, passes the boolean. |
| `src/core/features/tier-matrix.ts` | `bridges`: Personal+, shipped. |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/bridges/bridges.test.ts` | Every bridge's match/translate + negatives (deep reddit URLs, github reserved/sub-page, medium.com/@user, YouTube channelId extraction, no-match/unparseable). |
| `tests/core/discovery/discovery.test.js` | Strategy 0 short-circuits before the page fetch when enabled; bridge URL never tried when the gate is off. |
| `tests/core/features/tier-matrix.test.ts` | `bridges` is Personal+, shipped. |

## Design Decisions

- **URL translation, not scraping** — ADR 021. Bridges propose; `tryParseFeed`
  disposes. Near-zero maintenance.
- **Strategy 0, before the page fetch** — a recognised source resolves without
  fetching its landing page at all.
- **Gate resolved at the store, threaded as a boolean** — core never imports
  the license store.
- **Registration order** — host-scoped bridges before Mastodon, whose
  host-agnostic `/@user` matcher would otherwise shadow YouTube's `/@handle`.

## Limitations

- Sources that publish **no** native feed (Twitter/X, Instagram, arbitrary
  pages) are out of scope — they require scraping (ADR 021 forbids it here).
- GitHub defaults to `releases.atom`; per-repo commit/tag feeds aren't
  selectable yet.
- Shorthand inputs (`r/foo`, `@user@instance`) aren't accepted — the user
  pastes the full source URL. A shorthand parser is possible future work.
- Mastodon detection is host-denylist based; an unknown platform reusing the
  `/@user` path shape produces a candidate that simply fails to parse.
