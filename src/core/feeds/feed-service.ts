import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { parse } from "../parser/parser.ts";
import { discoverFeed } from "../discovery/discovery.ts";
import { createFeed, createArticle } from "../storage/schema.ts";
import {
  addFeed,
  feedExistsByUrl,
  getFeeds,
  removeFeedsByUrl,
  addArticles,
  getArticleByGuid,
  updateArticle,
} from "../storage/db.ts";
import type { Feed, Article } from "../../types/index.ts";

interface AddFeedResult {
  feed: Feed;
  articles: Article[];
}

interface RefreshResult {
  newCount: number;
  updatedCount: number;
}

interface RefreshAllResult {
  results: Array<{ feed: Feed; newCount: number; updatedCount: number; error?: string }>;
}

/**
 * Translate internal parser/validator errors into user-friendly messages.
 * Keeps the original error in parentheses for debugging.
 */
function friendlyError(rawError: string): string {
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
 * Normalize a feed URL for consistent storage and duplicate detection.
 * Lowercases scheme/host, removes trailing slash, trims whitespace.
 */
export function normalizeUrl(url: string): string {
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
export async function addFeedFlow(rawUrl: string): Promise<Result<AddFeedResult>> {
  const url = normalizeUrl(rawUrl);
  try {
    // Check for duplicate using the plaintext URL index (no decryption needed)
    const exists = await feedExistsByUrl(url);
    if (exists.ok && exists.value) {
      // URL exists in index — check if it's a real feed or an orphan
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
      .filter((a): a is Article => a !== null);

    await addArticles(articles);

    return ok({ feed, articles });
  } catch {
    return err(
      "The feed at this URL could not be reached. Please check your connection and try again.",
    );
  }
}

/**
 * Refresh a single feed: fetch latest XML, add new articles, update changed ones.
 */
export async function refreshFeed(feed: Feed): Promise<Result<RefreshResult>> {
  try {
    const proxyUrl = `/api/feed?url=${encodeURIComponent(feed.url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      return err(`Failed to fetch feed (HTTP ${response.status})`);
    }
    const text = await response.text();
    const parseResult = parse(text, feed.url);
    if (!parseResult.ok) return err(parseResult.error);

    const parsedArticles = parseResult.value.articles;
    const newArticles = [];
    const updatedArticles: Article[] = [];

    for (const parsed of parsedArticles) {
      const guid = parsed.guid || parsed.link;
      if (!guid) continue;

      const existing = await getArticleByGuid(feed.id, guid);
      if (!existing.ok) continue;

      if (existing.value === null) {
        // New article
        newArticles.push(parsed);
      } else {
        // Existing — check if content changed
        const oldContent = existing.value.content || "";
        const newContent = parsed.content || "";
        if (newContent && newContent !== oldContent) {
          existing.value.content = newContent;
          existing.value.summary = parsed.summary || existing.value.summary;
          existing.value.title = parsed.title || existing.value.title;
          updatedArticles.push(existing.value);
        }
      }
    }

    // Store new articles
    const created = newArticles
      .map((a) => {
        const r = createArticle({ feedId: feed.id, ...a });
        return r.ok ? r.value : null;
      })
      .filter((a): a is Article => a !== null);

    if (created.length > 0) {
      await addArticles(created);
    }

    // Update changed articles
    for (const article of updatedArticles) {
      await updateArticle(article);
    }

    return ok({
      newCount: created.length,
      updatedCount: updatedArticles.length,
    });
  } catch (e) {
    return err(`Refresh failed: ${(e as Error).message}`);
  }
}

/**
 * Refresh all feeds sequentially.
 */
export async function refreshAllFeeds(): Promise<Result<RefreshAllResult>> {
  const feedsResult = await getFeeds();
  if (!feedsResult.ok) return err(feedsResult.error);

  const results: RefreshAllResult["results"] = [];
  for (const feed of feedsResult.value) {
    const result = await refreshFeed(feed);
    if (result.ok) {
      results.push({ feed, ...result.value });
    } else {
      results.push({ feed, newCount: 0, updatedCount: 0, error: result.error });
    }
  }

  return ok({ results });
}
