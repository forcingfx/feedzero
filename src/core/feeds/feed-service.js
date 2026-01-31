import { ok, err } from "../../utils/result.js";
import { parse } from "../parser/parser.js";
import { needsExtraction, extract } from "../extractor/extractor.js";
import { discoverFeed } from "../discovery/discovery.js";
import { createFeed, createArticle } from "../storage/schema.js";
import {
  addFeed,
  feedExistsByUrl,
  getFeeds,
  removeFeedsByUrl,
  addArticles,
} from "../storage/db.js";

/**
 * Translate internal parser/validator errors into user-friendly messages.
 * Keeps the original error in parentheses for debugging.
 */
function friendlyError(rawError) {
  if (
    rawError.startsWith("Invalid XML") ||
    rawError.startsWith("Unrecognized feed format") ||
    rawError.startsWith("Unknown feed type") ||
    rawError.startsWith("No root element") ||
    rawError.startsWith("JSON object is not a JSON Feed") ||
    rawError.startsWith("Parse error") ||
    rawError.startsWith("Feed content is empty")
  ) {
    return "This URL is not a valid feed. Please check the URL and try again.";
  }
  return rawError;
}

/**
 * Fetch and extract full-text content for articles that only have summaries.
 * Modifies articles in place. Failures are non-fatal — the article keeps its original content.
 */
async function extractFullText(articles) {
  for (const article of articles) {
    if (!needsExtraction(article)) continue;

    try {
      const pageUrl = `/api/page?url=${encodeURIComponent(article.link)}`;
      const response = await fetch(pageUrl);
      if (!response.ok) continue;

      const html = await response.text();
      const result = extract(html, article.link);
      if (result.ok && result.value.content) {
        article.content = result.value.content;
      }
    } catch {
      // Extraction failure is non-fatal — keep original content/summary
    }
  }
}

/**
 * Normalize a feed URL for consistent storage and duplicate detection.
 * Lowercases scheme/host, removes trailing slash, trims whitespace.
 */
export function normalizeUrl(url) {
  const trimmed = url.trim();

  // Try parsing as-is first
  try {
    const u = new URL(trimmed);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString().replace(/\/+$/, "");
  } catch {
    // Not a valid URL — try prepending https://
  }

  try {
    const u = new URL(`https://${trimmed}`);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

/**
 * Full add-feed flow: check duplicate → fetch → parse → store.
 * Returns Result<{feed, articles}> with user-friendly error messages.
 */
export async function addFeedFlow(rawUrl) {
  const url = normalizeUrl(rawUrl);
  try {
    // Check for duplicate using the plaintext URL index (no decryption needed)
    const exists = await feedExistsByUrl(url);
    if (exists.ok && exists.value) {
      // URL exists in index — check if it's a real feed or an orphan
      // (orphan = record exists but can't be decrypted, e.g. from old salt)
      const allFeeds = await getFeeds();
      const isReal = allFeeds.ok && allFeeds.value.some((f) => f.url === url);
      if (isReal) {
        return err("A feed with this URL already exists");
      }
      // Orphaned record — clean it up and proceed
      await removeFeedsByUrl(url);
    }

    // Fetch feed content via CORS proxy
    const proxyUrl = `/api/feed?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      return err(
        `The feed at this URL could not be reached (HTTP ${response.status}).`,
      );
    }
    const text = await response.text();

    // Parse feed content — if it fails, try feed discovery (maybe it's a website)
    const parseResult = parse(text, url);

    let feedData;
    let parsedArticles;
    let discoveredUrl = url;

    if (parseResult.ok) {
      feedData = parseResult.value.feed;
      parsedArticles = parseResult.value.articles;
    } else {
      // Not a feed — try discovering a feed from this URL
      const discovery = await discoverFeed(url);
      if (!discovery.ok) return err(friendlyError(parseResult.error));

      feedData = discovery.value.feed;
      parsedArticles = discovery.value.articles;
      discoveredUrl = discovery.value.feedUrl;
    }

    // Extract full text for articles that only have summaries
    await extractFullText(parsedArticles);

    // Create and store feed (use discovered URL if feed was found via discovery)
    const feedResult = createFeed({
      url: discoveredUrl,
      title: feedData.title,
      description: feedData.description,
      siteUrl: feedData.siteUrl,
    });
    if (!feedResult.ok) return feedResult;

    const feed = feedResult.value;
    const storeResult = await addFeed(feed);
    if (!storeResult.ok) return storeResult;

    // Create and store articles
    const articles = parsedArticles
      .map((a) => {
        const r = createArticle({ feedId: feed.id, ...a });
        return r.ok ? r.value : null;
      })
      .filter(Boolean);

    await addArticles(articles);

    return ok({ feed, articles });
  } catch (e) {
    return err(
      "The feed at this URL could not be reached. Please check your connection and try again.",
    );
  }
}
