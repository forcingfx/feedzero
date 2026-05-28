/**
 * Feed discovery strategies.
 * Each function returns an array of candidate feed URLs to try.
 */

const FEED_LINK_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
];

const FEED_KEYWORD_PATTERN = /\b(rss|feed|atom|xml)\b/i;

const WELL_KNOWN_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed.json",
  "/rss/",
  "/feed/",
  "/?feed=rss2",
];

/**
 * Find feed URLs from <link rel="alternate"> tags in HTML <head>.
 */
export function findFeedLinksInHtml(html: string, pageUrl: string): string[] {
  if (!html) return [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = doc.querySelectorAll('link[rel="alternate"]');
    const results: string[] = [];

    for (const link of links) {
      const type = (link.getAttribute("type") || "").toLowerCase();
      const href = link.getAttribute("href");
      if (!href || !FEED_LINK_TYPES.includes(type)) continue;

      try {
        results.push(new URL(href, pageUrl).toString());
      } catch {
        // Invalid href — skip
      }
    }

    return results;
  } catch {
    // DOMParser failed on malformed HTML — yield no candidates so the
    // discovery cascade falls through to the next strategy.
    return [];
  }
}

/**
 * Generate well-known feed URL candidates from a site's origin.
 */
export function getWellKnownFeedUrls(pageUrl: string): string[] {
  try {
    const origin = new URL(pageUrl).origin;
    return WELL_KNOWN_PATHS.map((path) => `${origin}${path}`);
  } catch {
    // pageUrl was not a parseable absolute URL — no origin to derive
    // candidates from. Falls through to the next discovery strategy.
    return [];
  }
}

/**
 * Find feed-like URLs in <a> tags in the page body.
 */
export function findFeedLinksInAnchors(html: string, pageUrl: string): string[] {
  if (!html) return [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = doc.querySelectorAll("a[href]");
    const results: string[] = [];

    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href || !FEED_KEYWORD_PATTERN.test(href)) continue;

      try {
        results.push(new URL(href, pageUrl).toString());
      } catch {
        // Invalid href — skip
      }
    }

    return results;
  } catch {
    // DOMParser failed on malformed HTML — yield no candidates so the
    // discovery cascade falls through to the next strategy.
    return [];
  }
}
