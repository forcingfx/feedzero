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
 * Strategy 2: Find feed URLs from <link rel="alternate"> tags in HTML <head>.
 * @param {string} html - Raw HTML of the page
 * @param {string} pageUrl - URL of the page (for resolving relative hrefs)
 * @returns {string[]} Absolute feed URLs found
 */
export function findFeedLinksInHtml(html, pageUrl) {
  if (!html) return [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = doc.querySelectorAll('link[rel="alternate"]');
    const results = [];

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
    return [];
  }
}

/**
 * Strategy 3: Generate well-known feed URL candidates from a site's origin.
 * @param {string} pageUrl - Any URL on the site
 * @returns {string[]} Candidate feed URLs to probe
 */
export function getWellKnownFeedUrls(pageUrl) {
  try {
    const origin = new URL(pageUrl).origin;
    return WELL_KNOWN_PATHS.map((path) => `${origin}${path}`);
  } catch {
    return [];
  }
}

/**
 * Strategy 4: Find feed-like URLs in <a> tags in the page body.
 * @param {string} html - Raw HTML of the page
 * @param {string} pageUrl - URL of the page (for resolving relative hrefs)
 * @returns {string[]} Absolute feed URLs found
 */
export function findFeedLinksInAnchors(html, pageUrl) {
  if (!html) return [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = doc.querySelectorAll("a[href]");
    const results = [];

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
    return [];
  }
}
