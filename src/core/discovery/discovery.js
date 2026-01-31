import { ok, err } from "../../utils/result.js";
import { parse } from "../parser/parser.js";
import {
  findFeedLinksInHtml,
  getWellKnownFeedUrls,
  findFeedLinksInAnchors,
} from "./strategies.js";

/**
 * Try to parse a URL as a feed. Returns the parse result or null on failure.
 */
async function tryParseFeed(feedUrl) {
  try {
    const proxyUrl = `/api/feed?url=${encodeURIComponent(feedUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;

    const text = await response.text();
    const result = parse(text, feedUrl);
    if (!result.ok) return null;

    return { feedUrl, ...result.value };
  } catch {
    return null;
  }
}

/**
 * Try a list of candidate URLs, returning the first that parses as a valid feed.
 */
async function tryCandiates(urls) {
  for (const url of urls) {
    const result = await tryParseFeed(url);
    if (result) return result;
  }
  return null;
}

/**
 * Discover a feed from a website URL using a multi-strategy cascade.
 *
 * Strategies (in order):
 * 1. HTML <link rel="alternate"> autodiscovery
 * 2. Well-known feed paths (/feed, /rss, /atom.xml, etc.)
 * 3. Anchor link scanning for feed-like URLs
 *
 * @param {string} url - The website URL to discover feeds from
 * @returns {Promise<Result<{feedUrl: string, feed: object, articles: object[]}>>}
 */
export async function discoverFeed(url) {
  try {
    // Fetch the page HTML (reused for strategies 1 and 3)
    const pageProxyUrl = `/api/page?url=${encodeURIComponent(url)}`;
    const pageResponse = await fetch(pageProxyUrl);
    if (!pageResponse.ok) {
      return err("Could not fetch the page for feed discovery.");
    }
    const html = await pageResponse.text();

    // Strategy 1: HTML <link> autodiscovery
    const linkUrls = findFeedLinksInHtml(html, url);
    const fromLinks = await tryCandiates(linkUrls);
    if (fromLinks) return ok(fromLinks);

    // Strategy 2: Well-known paths
    const wellKnownUrls = getWellKnownFeedUrls(url);
    const fromWellKnown = await tryCandiates(wellKnownUrls);
    if (fromWellKnown) return ok(fromWellKnown);

    // Strategy 3: Anchor link scanning
    const anchorUrls = findFeedLinksInAnchors(html, url);
    const fromAnchors = await tryCandiates(anchorUrls);
    if (fromAnchors) return ok(fromAnchors);

    return err(
      "No RSS feed could be found at this URL. Please check the URL and try again.",
    );
  } catch {
    return err(
      "Feed discovery failed. Please check the URL and try again.",
    );
  }
}
