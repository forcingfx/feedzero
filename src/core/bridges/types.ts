/**
 * A bridge turns a human-facing URL for a source that doesn't *look* like a
 * feed (a YouTube channel page, a subreddit, a Mastodon profile, a GitHub
 * repo) into the URL of a real, native feed that source already publishes.
 *
 * Bridges are URL translators, NOT scrapers. Every output is a feed URL that
 * the discovery cascade then validates via `tryParseFeed` — so a bridge only
 * needs to *propose* a candidate; a wrong guess simply fails to parse and the
 * cascade falls through. This keeps bridges tiny and near-zero-maintenance:
 * there is no publisher HTML to track, only stable feed-URL conventions.
 *
 * (Contrast with the rss-bridge project, which scrapes markup for sources
 * that publish no feed at all — that inherits a perpetual maintenance
 * treadmill we deliberately stay out of. See docs/decisions/021.)
 */
export interface Bridge {
  /** Human-readable name for debugging. */
  name: string;
  /** Whether this bridge recognises the (already-parsed) URL. */
  matches(url: URL): boolean;
  /**
   * Translate to a native feed URL. Async because some sources (YouTube
   * @handles) need one fetch to resolve an opaque id. Returns null when the
   * URL is recognised but a feed URL can't be produced.
   */
  toFeedUrl(url: URL): Promise<string | null>;
}
