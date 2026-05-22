# ADR 021: Bridges are URL Translators, Not Scrapers

## Status

Accepted (2026-05-22).

## Context

Users repeatedly ask FeedZero to follow sources that don't *look* like feeds:
a YouTube channel, a subreddit, a Mastodon profile, a GitHub repo. The
inspiration is the [rss-bridge](https://github.com/RSS-Bridge/rss-bridge)
project, which generates feeds for hundreds of sites — including many that
publish no feed at all (Twitter/X, Instagram, arbitrary HTML pages) by
scraping their markup.

Scraping is a perpetual maintenance treadmill: every target's HTML changes a
couple of times a year, each change silently breaks that bridge, and several
of the highest-demand targets (Twitter/X, Instagram) are also ToS-hostile and
anonymity-fraught to fetch. This is the same maintenance-model trap ADR 020
calls out for paywall detection.

But there's a large, high-value subset that needs **no scraping at all**: many
"non-RSS" sources actually publish a perfectly good native feed at a
non-obvious URL.

| Source | Native feed | Transform |
|--------|-------------|-----------|
| YouTube channel | `youtube.com/feeds/videos.xml?channel_id=…` | pure (1 fetch to resolve `@handle`→id) |
| Reddit sub/user | `reddit.com/r/<x>/.rss` | pure |
| Mastodon profile | `<instance>/@user.rss` | pure |
| GitHub repo | `github.com/<o>/<r>/releases.atom` | pure |

## Decision

FeedZero ships **bridges that are pure URL translators**. A bridge recognises a
source URL and maps it to the URL of a native feed that source already
publishes. It never parses or scrapes the source's HTML for content (the one
fetch a bridge may make — YouTube `@handle`→channelId — reads a single opaque
id, not article content).

Every bridge output is a *candidate*: the discovery cascade validates it via
`tryParseFeed` (strategy 0, before the HTML-based strategies). A wrong guess
fails to parse and the cascade falls through, so bridges can be imprecise
without being unsafe. This is what keeps each bridge a few lines of stable
URL convention with near-zero maintenance.

### Forbidden

- **No HTML scraping for content.** If a future bridge proposes parsing a
  page's markup into feed items (because the source publishes no feed), it
  must come with an ADR superseding this one and an explicit owner for the
  per-target maintenance cost.
- **No bridges for ToS-hostile / anonymity-fraught targets** (Twitter/X,
  Instagram) in this model — they require scraping by definition.

## Consequences

- `src/core/bridges/` — `Bridge` interface, ordered registry, one file per
  source, `resolveBridgeFeedUrl()` public API. Mirrors the
  `paywall-detectors/` and extractor `adapters/` registry pattern.
- `discoverFeed(url, { bridges })` runs bridge resolution as strategy 0.
- `bridges` is a Personal-tier, shipped feature in the tier matrix. The gate
  is resolved at the store layer (`feed-store`) and threaded into
  `addFeedFlow` → `discoverFeed` as a plain boolean, so core stays
  store-agnostic.
- Adding a source = one file + registration + tests. No UI work: bridges are
  transparent — the user pastes the channel/sub/profile/repo URL into the
  normal "Add feed" box.

## References

- `src/core/bridges/`, `src/core/discovery/discovery.ts` (strategy 0).
- ADR 020 (browser-extension surface) — same maintenance-model reasoning for
  paywall detectors.
- Feature 020 (`docs/features/020-bridges.md`).
