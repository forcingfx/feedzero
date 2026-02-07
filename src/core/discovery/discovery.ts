import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { parse } from "../parser/parser.ts";
import type { ParseResult } from "../parser/parser.ts";
import {
  findFeedLinksInHtml,
  getWellKnownFeedUrls,
  findFeedLinksInAnchors,
} from "./strategies.ts";
import { proxyFetch } from "../proxy/proxy-fetch.ts";

interface DiscoveryResult extends ParseResult {
  feedUrl: string;
}

/**
 * Try to parse a URL as a feed. Returns the parse result or null on failure.
 */
async function tryParseFeed(feedUrl: string): Promise<DiscoveryResult | null> {
  try {
    const response = await proxyFetch("/api/feed", feedUrl);
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
async function tryCandidates(urls: string[]): Promise<DiscoveryResult | null> {
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
 */
export async function discoverFeed(
  url: string,
): Promise<Result<DiscoveryResult>> {
  try {
    // Fetch the page HTML (reused for strategies 1 and 3)
    const pageResponse = await proxyFetch("/api/page", url);
    if (!pageResponse.ok) {
      return err("Could not fetch the page for feed discovery.");
    }
    const html = await pageResponse.text();

    // Strategy 1: HTML <link> autodiscovery
    const linkUrls = findFeedLinksInHtml(html, url);
    const fromLinks = await tryCandidates(linkUrls);
    if (fromLinks) return ok(fromLinks);

    // Strategy 2: Well-known paths
    const wellKnownUrls = getWellKnownFeedUrls(url);
    const fromWellKnown = await tryCandidates(wellKnownUrls);
    if (fromWellKnown) return ok(fromWellKnown);

    // Strategy 3: Anchor link scanning
    const anchorUrls = findFeedLinksInAnchors(html, url);
    const fromAnchors = await tryCandidates(anchorUrls);
    if (fromAnchors) return ok(fromAnchors);

    return err(
      "No RSS feed could be found at this URL. Please check the URL and try again.",
    );
  } catch {
    return err("Feed discovery failed. Please check the URL and try again.");
  }
}
