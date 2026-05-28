import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { parse } from "../parser/parser.ts";
import type { ParseResult } from "../parser/parser.ts";
import {
  findFeedLinksInHtml,
  getWellKnownFeedUrls,
  findFeedLinksInAnchors,
} from "./strategies.ts";
import { proxyFetch } from "../proxy/proxy-fetch.ts";
import { resolveBridgeFeedUrl } from "../bridges/index.ts";

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
    // Network or transport failure on this candidate — treat as "not a
    // feed" so the cascade walks to the next candidate URL. A real
    // outage surfaces later when the user's chosen candidate also
    // fails; this branch is intentionally silent per strategy.
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
 * 0. Bridges — non-RSS sources (YouTube/Reddit/Mastodon/GitHub) mapped to
 *    their native feed URL. Only run when `options.bridges` is true (the
 *    caller resolves the Personal-tier gate). Runs before the page fetch so
 *    a recognised source resolves without scraping the landing page.
 * 1. HTML <link rel="alternate"> autodiscovery
 * 2. Well-known feed paths (/feed, /rss, /atom.xml, etc.)
 * 3. Anchor link scanning for feed-like URLs
 */
export async function discoverFeed(
  url: string,
  options?: { bridges?: boolean },
): Promise<Result<DiscoveryResult>> {
  try {
    // Strategy 0: bridges. The candidate is validated by tryParseFeed, so a
    // wrong guess falls through to the page-based strategies below.
    if (options?.bridges) {
      const bridged = await resolveBridgeFeedUrl(url);
      if (bridged) {
        const fromBridge = await tryParseFeed(bridged);
        if (fromBridge) return ok(fromBridge);
      }
    }

    // Fetch the page HTML (reused for strategies 1 and 3)
    const pageResponse = await proxyFetch("/api/page", url);
    if (!pageResponse.ok) {
      // Surface the upstream HTTP status so the user sees the actual cause.
      // Pre-2026-05 code collapsed every failure to "Could not fetch the
      // page", and discovery's final "No RSS feed could be found" then
      // misled self-hosters whose real problem was upstream rate-limiting
      // or IP-reputation blocks. See feedback issue #97.
      const status = pageResponse.status;
      if (status === 429) {
        const retryAfter = pageResponse.headers?.get?.("retry-after");
        return err(
          retryAfter
            ? `Upstream rate-limited this request (429). Try again in ${retryAfter}s.`
            : "Upstream rate-limited this request (429). Try again later.",
        );
      }
      if (status === 403) {
        return err(
          "Upstream blocked our request (403). Some sites block non-browser " +
            "fetchers — try copying the RSS link directly instead of the homepage URL.",
        );
      }
      if (status >= 500) {
        return err(`Upstream server error (${status}). Try again later.`);
      }
      return err(`Could not fetch the page for feed discovery (HTTP ${status}).`);
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
