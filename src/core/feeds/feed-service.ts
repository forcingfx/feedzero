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
  updateArticles,
  updateFeed,
  removeArticlesByFeedId,
} from "../storage/db.ts";
import type { Feed, Article } from "../../types/index.ts";
import { proxyFetch } from "../proxy/proxy-fetch.ts";
import { groupByHostForRefresh } from "./group-by-host.ts";
import { parseRetryAfter } from "./parse-retry-after.ts";
import { applyRules } from "../rules/engine.ts";
import { buildContext } from "../filters/evaluator.ts";

interface AddFeedResult {
  feed: Feed;
  articles: Article[];
}

/**
 * Discriminator on `addFeedFlow`'s err branch. `fetch-failure` marks a
 * recoverable failure (HTTP error response or network/transport error) — the
 * import flow uses it to create a placeholder feed the user can retry via
 * `refreshFeed`. Parse / discovery / duplicate failures stay unflagged
 * because retry won't help.
 */
export type AddFeedErrorReason = "fetch-failure";

export type AddFeedFlowResult =
  | { ok: true; value: AddFeedResult }
  | { ok: false; error: string; reason?: AddFeedErrorReason };

interface RefreshResult {
  newCount: number;
  updatedCount: number;
}

interface RefreshAllResult {
  results: Array<{
    feed: Feed;
    newCount: number;
    updatedCount: number;
    error?: string;
  }>;
}

/**
 * Format a non-OK proxy response into a user-facing error.
 * For 429 / 503 we surface the upstream Retry-After hint as a delta in
 * seconds so the message tells the user how long to wait, not just the
 * bare HTTP code. Parsing goes through `parseRetryAfter` so both
 * delta-seconds and HTTP-date forms work, with the same 24h clamp the
 * rest of the codebase uses. Reads the header lowercase so the helper
 * works against both real `Headers` (case-insensitive) and the Map-based
 * mocks used in some refresh tests.
 */
function fetchErrorMessage(
  response: { status: number; headers?: { get?: (k: string) => string | null } },
  prefix: string,
): string {
  const { status } = response;
  if (status === 429 || status === 503) {
    const retryAt = parseRetryAfter(
      response.headers?.get?.("retry-after") ?? null,
      Date.now(),
    );
    if (retryAt !== null) {
      const seconds = Math.ceil((retryAt - Date.now()) / 1000);
      return `${prefix} (HTTP ${status}, retry after ${seconds}s)`;
    }
  }
  return `${prefix} (HTTP ${status})`;
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
 * Tag an err Result with `reason: "fetch-failure"` so import-side callers
 * know the failure is recoverable (HTTP / network) and can create a
 * placeholder feed for later retry. Permanent failures (parse, discovery,
 * duplicate) skip this and stay as plain err Results.
 */
function fetchFailure(message: string): AddFeedFlowResult {
  return { ok: false, error: message, reason: "fetch-failure" };
}

/**
 * Full add-feed flow: check duplicate → fetch → parse → store.
 * Returns AddFeedFlowResult with user-friendly error messages. On a
 * recoverable failure the err branch carries `reason: "fetch-failure"`.
 */
export async function addFeedFlow(
  rawUrl: string,
  options?: { prefetchedContent?: string; bridgesEnabled?: boolean },
): Promise<AddFeedFlowResult> {
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

    // Use prefetched content or fetch via CORS proxy
    let text: string;
    if (options?.prefetchedContent) {
      text = options.prefetchedContent;
    } else {
      const response = await proxyFetch("/api/feed", url);
      if (!response.ok) {
        return fetchFailure(
          fetchErrorMessage(response, "The feed at this URL could not be reached"),
        );
      }
      text = await response.text();
    }

    // Parse feed content — if it fails, try feed discovery (maybe it's a website)
    const parseResult = parse(text, url);

    let feedData;
    let parsedArticles;
    let discoveredUrl = url;

    if (parseResult.ok) {
      feedData = parseResult.value.feed;
      parsedArticles = parseResult.value.articles;
    } else {
      // Not a feed — try discovering a feed from this URL. Bridges
      // (strategy 0) only run when the caller resolved the Personal-tier
      // gate; the boolean is threaded down so core stays store-agnostic.
      const discovery = await discoverFeed(url, {
        bridges: options?.bridgesEnabled ?? false,
      });
      if (!discovery.ok) return err(friendlyError(discovery.error));

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

    // Mark the just-ingested feed as having had at least one successful
    // fetch. This is what distinguishes a real feed from a placeholder
    // (which has `lastSuccessfulFetchAt === undefined`) — and protects the
    // user's rename of an established feed from being overwritten by the
    // first-success metadata backfill in refreshFeed.
    const now = Date.now();
    const feed: Feed = {
      ...feedResult.value,
      lastFetchedAt: now,
      lastSuccessfulFetchAt: now,
    };
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
    return fetchFailure(
      "The feed at this URL could not be reached. Please check your connection and try again.",
    );
  }
}

/**
 * Derive a recognizable sidebar title from a URL when the real feed
 * metadata isn't yet available (placeholder created by failed import).
 * The first successful refresh overwrites this with the real `<title>`.
 */
function deriveTitleFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Persist a feed the user wanted to subscribe to but whose first fetch
 * failed (HTTP / network error). Used by the bulk-import flow so a
 * rate-limited URL doesn't get dropped — the sidebar shows it with a red
 * error indicator, the user hits "r" or right-click → Refresh, and the
 * first successful refresh upgrades the row to a normal feed in place
 * (clears `lastError`, backfills title/description/siteUrl from the
 * parsed payload).
 */
export async function addPlaceholderFeed(
  rawUrl: string,
  error: string,
): Promise<Result<Feed>> {
  const url = normalizeUrl(rawUrl);

  const exists = await feedExistsByUrl(url);
  if (exists.ok && exists.value) {
    const allFeeds = await getFeeds();
    const isReal = allFeeds.ok && allFeeds.value.some((f) => f.url === url);
    if (isReal) return err("A feed with this URL already exists");
    await removeFeedsByUrl(url);
  }

  const created = createFeed({
    url,
    title: deriveTitleFromUrl(url),
  });
  if (!created.ok) return created;

  const feed: Feed = {
    ...created.value,
    lastError: error,
    lastFetchedAt: Date.now(),
  };

  const store = await addFeed(feed);
  if (!store.ok) return err(store.error);

  return ok(feed);
}

interface PreviewArticle {
  title: string;
  link: string;
  summary: string;
  publishedAt: number | null;
}

interface PreviewResult {
  title: string;
  siteUrl: string;
  articles: PreviewArticle[];
}

/**
 * Fetch and parse a feed for preview without persisting anything.
 * Returns the feed title and a list of articles with titles and summaries.
 */
export async function previewFeed(
  rawUrl: string,
): Promise<Result<PreviewResult>> {
  const url = normalizeUrl(rawUrl);
  try {
    const response = await proxyFetch("/api/feed", url);
    if (!response.ok) {
      return err(
        fetchErrorMessage(response, "The feed at this URL could not be reached"),
      );
    }
    const text = await response.text();

    const parseResult = parse(text, url);
    if (!parseResult.ok) {
      return err(friendlyError(parseResult.error));
    }

    const { feed, articles } = parseResult.value;
    return ok({
      title: feed.title,
      siteUrl: feed.siteUrl,
      articles: articles.map((a) => ({
        title: a.title,
        link: a.link,
        summary: a.summary || a.content.replace(/<[^>]*>/g, "").slice(0, 200),
        publishedAt: a.publishedAt,
      })),
    });
  } catch {
    return err(
      "The feed could not be reached. Please check your connection and try again.",
    );
  }
}

/**
 * Refresh a single feed: fetch latest XML, add new articles, update changed ones.
 * Persists freshness timestamps on every attempt — both for "we tried" (the
 * stale-indicator floor) and for "the publisher actually responded" (the
 * stale-indicator threshold). A failing refresh must never clobber a prior
 * successful timestamp.
 */
export async function refreshFeed(feed: Feed): Promise<Result<RefreshResult>> {
  const now = Date.now();
  try {
    const response = await proxyFetch("/api/feed", feed.url);
    if (!response.ok) {
      // Always record the attempt so the stale-indicator clock keeps
      // moving; never clobber a prior success timestamp. The user-facing
      // error message surfaces Retry-After when the upstream sent one
      // (feedback #97: self-host bulk refresh against fresh IPs trips
      // upstream WAFs and the user needs to know when to retry).
      const errorMessage = fetchErrorMessage(response, "Failed to fetch feed");
      await persistFreshness(feed, {
        fetchedAt: now,
        successfulAt: null,
        lastError: errorMessage,
      });
      return err(errorMessage);
    }
    const text = await response.text();
    const parseResult = parse(text, feed.url);
    if (!parseResult.ok) {
      // HTTP succeeded but content was unparseable — the publisher is alive,
      // so this still counts as a successful reach.
      await persistFreshness(feed, {
        fetchedAt: now,
        successfulAt: now,
        lastError: parseResult.error,
      });
      return err(parseResult.error);
    }

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

    // Store new articles, applying any per-feed rules first so
    // `muted` / `starred` / `read` / `folderId` ride into IndexedDB
    // (and the encrypted vault) in their final post-rule shape. The
    // rule engine reuses the smart-filter EvalContext; rules can't
    // reference other rules or smart filters yet, so an empty
    // `filters` list is fine.
    const created = newArticles
      .map((a) => {
        const r = createArticle({ feedId: feed.id, ...a });
        return r.ok ? r.value : null;
      })
      .filter((a): a is Article => a !== null);

    const rulesToApply = feed.rules ?? [];
    const ruleCtx = buildContext({ feeds: [feed], filters: [] });
    const finalArticles =
      rulesToApply.length > 0
        ? created.map((a) => applyRules(a, rulesToApply, ruleCtx))
        : created;

    if (finalArticles.length > 0) {
      await addArticles(finalArticles);
    }

    // Update changed articles in bulk
    if (updatedArticles.length > 0) {
      await updateArticles(updatedArticles);
    }

    // First-ever success on this feed (typically a placeholder added by
    // import after a fetch failure): backfill title/description/siteUrl
    // from the parsed payload so the sidebar gets a real label. Skipped
    // on subsequent successes so a user's rename is never clobbered.
    const isFirstSuccess = feed.lastSuccessfulFetchAt === undefined;
    if (isFirstSuccess) {
      const parsedFeed = parseResult.value.feed;
      if (parsedFeed.title) feed.title = parsedFeed.title;
      if (parsedFeed.description) feed.description = parsedFeed.description;
      if (parsedFeed.siteUrl) feed.siteUrl = parsedFeed.siteUrl;
    }

    await persistFreshness(feed, {
      fetchedAt: now,
      successfulAt: now,
      lastError: null,
    });

    return ok({
      newCount: created.length,
      updatedCount: updatedArticles.length,
    });
  } catch (e) {
    // Network / transport-layer failure: record the attempt but keep any
    // prior success timestamp so we don't reset the stale-indicator clock.
    const errorMessage = `Refresh failed: ${(e as Error).message}`;
    await persistFreshness(feed, {
      fetchedAt: now,
      successfulAt: null,
      lastError: errorMessage,
    });
    return err(errorMessage);
  }
}

/**
 * Mutate `feed` in place with new freshness timestamps + lastError and
 * persist via updateFeed. `successfulAt: null` keeps the prior value so a
 * transient failure doesn't reset the stale-indicator clock.
 * `lastError: null` explicitly clears a previous failure (success path);
 * `lastError: string` records the new failure.
 */
async function persistFreshness(
  feed: Feed,
  ts: {
    fetchedAt: number;
    successfulAt: number | null;
    lastError: string | null;
  },
): Promise<void> {
  feed.lastFetchedAt = ts.fetchedAt;
  if (ts.successfulAt !== null) feed.lastSuccessfulFetchAt = ts.successfulAt;
  if (ts.lastError === null) {
    delete feed.lastError;
  } else {
    feed.lastError = ts.lastError;
  }
  await updateFeed(feed);
}

/**
 * Refresh all feeds with per-host serialization.
 *
 * Cross-host requests run in parallel up to REFRESH_CONCURRENCY. Same-host
 * requests are serialized via `groupByHostForRefresh` so a bulk refresh
 * against many feeds on one upstream (feeds.feedburner.com, Substack
 * domains, etc.) doesn't burst-fire and trip per-IP rate limits — the
 * self-host symptom from feedback #97.
 */
/** Max concurrent feed refreshes to avoid network/CPU spikes. */
const REFRESH_CONCURRENCY = 5;

export async function refreshAllFeeds(): Promise<Result<RefreshAllResult>> {
  const feedsResult = await getFeeds();
  if (!feedsResult.ok) return err(feedsResult.error);

  const feeds = feedsResult.value;
  const results: RefreshAllResult["results"] = [];

  // Pack into batches where each batch has at most REFRESH_CONCURRENCY
  // feeds AND no two feeds share a host. Same-host duplicates fall into
  // later batches and refresh sequentially.
  const batches = groupByHostForRefresh(feeds, REFRESH_CONCURRENCY);
  for (const batch of batches) {
    const settled = await Promise.allSettled(
      batch.map((feed) =>
        refreshFeed(feed).then((result) => ({ feed, result })),
      ),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        results.push({
          feed: { id: "", url: "", title: "Unknown" } as Feed,
          newCount: 0,
          updatedCount: 0,
          error: String(outcome.reason),
        });
      } else {
        const { feed, result } = outcome.value;
        if (result.ok) {
          results.push({ feed, ...result.value });
        } else {
          results.push({ feed, newCount: 0, updatedCount: 0, error: result.error });
        }
      }
    }
  }

  return ok({ results });
}

/**
 * Reload a feed from scratch: delete all articles, re-fetch, re-parse, re-store.
 * Unlike refreshFeed, this doesn't do guid-based dedup — it replaces everything.
 */
export async function reloadFeed(
  feed: Feed,
  options?: { prefetchedContent?: string },
): Promise<Result<{ articleCount: number }>> {
  try {
    // Delete all existing articles for this feed
    const removeResult = await removeArticlesByFeedId(feed.id);
    if (!removeResult.ok) return err(removeResult.error);

    // Fetch fresh content
    let text: string;
    if (options?.prefetchedContent) {
      text = options.prefetchedContent;
    } else {
      const response = await proxyFetch("/api/feed", feed.url);
      if (!response.ok) {
        return err(fetchErrorMessage(response, "Failed to fetch feed"));
      }
      text = await response.text();
    }

    const parseResult = parse(text, feed.url);
    if (!parseResult.ok) return err(parseResult.error);

    // Store all articles fresh
    const articles: Article[] = [];
    for (const parsed of parseResult.value.articles) {
      const guid = parsed.guid || parsed.link;
      if (!guid) continue;

      const articleResult = createArticle({
        feedId: feed.id,
        guid,
        title: parsed.title,
        link: parsed.link,
        content: parsed.content,
        summary: parsed.summary,
        author: parsed.author,
        publishedAt: parsed.publishedAt ?? Date.now(),
      });
      if (articleResult.ok) articles.push(articleResult.value);
    }

    if (articles.length > 0) {
      const addResult = await addArticles(articles);
      if (!addResult.ok) return err(addResult.error);
    }

    return ok({ articleCount: articles.length });
  } catch (e) {
    return err(`Reload failed: ${(e as Error).message}`);
  }
}
