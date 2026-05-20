/**
 * Background prefetch of full-text content for starred articles.
 *
 * Runs after a feed refresh (and on explicit user action) to populate
 * `Article.extractedContent` for every starred article. Once persisted,
 * the article reads from `extractedContent` instead of the on-demand
 * extraction cache — so starred articles survive a reload, are available
 * offline, and ride through the encrypted vault to every other device the
 * user is signed into.
 *
 * This module is the Personal-tier value-add behind the "offline-prefetch"
 * feature gate. Callers MUST check the gate before invoking — see
 * `src/stores/feed-store.ts` for the refresh-completion wiring.
 *
 * Design notes:
 * - Pure orchestrator: the actual fetch (`proxyFetch`) and extraction
 *   (`extract`) are unchanged from the on-demand path, so a starred-and-
 *   prefetched article gets exactly the same HTML a manual "Full text"
 *   click would produce.
 * - Concurrency cap respects publisher etiquette and matches the existing
 *   per-host throttling logic in feed-service.ts.
 * - Age cutoff skips ancient stars so a power user with thousands of
 *   pre-existing saves doesn't trigger a multi-thousand-request burst on
 *   first run.
 */

import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { getAllArticles, updateArticle } from "../storage/db.ts";
import { proxyFetch } from "../proxy/proxy-fetch.ts";
import { extract } from "./extractor.ts";
import type { Article } from "../../types/index.ts";

/** Maximum concurrent extraction workers. Matches REFRESH_CONCURRENCY. */
export const PREFETCH_CONCURRENCY = 3;

/**
 * Trailing window for the frequency heuristic (ms). Reads within this
 * window count toward "frequently read" classification.
 */
export const FREQUENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Minimum read count within FREQUENCY_WINDOW_MS for a feed to be
 * auto-prefetched without the explicit per-feed toggle. The value is
 * deliberately gentle — most users read several articles from feeds
 * they actually like; one-off reads from an article-of-the-week feed
 * shouldn't pull a hundred extractions behind it.
 */
export const FREQUENCY_THRESHOLD = 10;

/**
 * Articles older than this are skipped on prefetch.
 * 90 days × 24h × 60m × 60s × 1000ms = 7_776_000_000.
 * Power users may have years of pre-existing stars; we don't want to
 * hammer publishers re-fetching content nobody is likely to revisit.
 */
export const PREFETCH_AGE_LIMIT_MS = 90 * 24 * 60 * 60 * 1000;

export interface PrefetchStats {
  /** Articles successfully fetched, extracted, and persisted. */
  extracted: number;
  /** Articles that were candidates but whose fetch or extraction failed. */
  failed: number;
}

function isFetchableLink(link: string): boolean {
  return (
    typeof link === "string" &&
    (link.startsWith("https://") || link.startsWith("http://"))
  );
}

/** Whether this article is a current prefetch candidate. */
function isPrefetchCandidate(article: Article, now: number): boolean {
  if (!article.starred) return false;
  if (article.extractedContent) return false;
  if (!isFetchableLink(article.link)) return false;
  if (now - (article.publishedAt ?? 0) > PREFETCH_AGE_LIMIT_MS) return false;
  return true;
}

/**
 * Whether this article is a feed-prefetch candidate. Mirrors the
 * starred predicate but drops the starred requirement — the call
 * site already filtered to one feed's articles via the limit/sort.
 */
function isFeedPrefetchCandidate(article: Article, now: number): boolean {
  if (article.extractedContent) return false;
  if (!isFetchableLink(article.link)) return false;
  if (now - (article.publishedAt ?? 0) > PREFETCH_AGE_LIMIT_MS) return false;
  return true;
}

/**
 * Fetch + extract + persist a single article. Returns true on success.
 * Failures are swallowed (logged via the caller's counter) so one bad
 * URL doesn't abort the whole batch.
 */
async function prefetchOne(article: Article): Promise<boolean> {
  try {
    const response = await proxyFetch("/api/page", article.link);
    if (!response.ok) return false;
    const html = await response.text();
    const extracted = extract(html, article.link);
    if (!extracted.ok || !extracted.value.content) return false;

    const updated: Article = {
      ...article,
      extractedContent: extracted.value.content,
      extractedAt: Date.now(),
    };
    const persist = await updateArticle(updated);
    return persist.ok;
  } catch {
    return false;
  }
}

/**
 * Run a fixed-size worker pool over `items`. Each worker pulls the next
 * item from a shared cursor, awaits the task, and accumulates the boolean
 * result. The pool resolves when every item has been processed.
 *
 * Plain semaphore-style scheduler — keeps the cap honest under back-to-back
 * resolution patterns (every settled task immediately starts the next),
 * which a chunked `Promise.all` slice loop would not.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<boolean>,
): Promise<{ ok: number; failed: number }> {
  let cursor = 0;
  let ok = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const success = await task(item);
      if (success) ok++;
      else failed++;
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return { ok, failed };
}

/**
 * Prefetch every starred article that is missing `extractedContent`.
 * Returns counts. Skips ancient stars (>90d) and non-http(s) links.
 *
 * Idempotent: an article whose `extractedContent` is already populated
 * is silently skipped, so repeated calls after refresh are cheap.
 *
 * Caller responsibility: gate this behind `useFeatureGate("offline-prefetch")`
 * (the React side) or `gateState(...)` (the store side).
 */
/**
 * Pre-extract the `limit` most recently published articles from
 * `feedId` that lack `extractedContent`. Drives the per-feed
 * "Prefetch full text" toggle and the frequency heuristic — anything
 * that wants to pre-cache a specific feed's articles without
 * requiring them to be starred goes through this function.
 *
 * Sort + limit happen before the concurrency cap, so we never fetch
 * more than `limit` URLs even if the feed has hundreds of items.
 */
export async function prefetchFeedArticles(
  feedId: string,
  limit: number,
): Promise<Result<PrefetchStats>> {
  if (limit <= 0) return ok({ extracted: 0, failed: 0 });
  const articlesResult = await getAllArticles();
  if (!articlesResult.ok) return err(articlesResult.error);

  const now = Date.now();
  const candidates = articlesResult.value
    .filter((a) => a.feedId === feedId && isFeedPrefetchCandidate(a, now))
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, limit);

  if (candidates.length === 0) {
    return ok({ extracted: 0, failed: 0 });
  }

  const { ok: extracted, failed } = await runWithConcurrency(
    candidates,
    PREFETCH_CONCURRENCY,
    prefetchOne,
  );
  return ok({ extracted, failed });
}

/**
 * Pure selector over a snapshot of articles: which feed ids has the
 * user read >= FREQUENCY_THRESHOLD articles from in the trailing
 * FREQUENCY_WINDOW_MS? Exported for testing — the wiring imports it
 * and passes the result into prefetchFeedArticles per match.
 */
export function selectFrequentFeeds(
  articles: Article[],
  now: number = Date.now(),
): string[] {
  const cutoff = now - FREQUENCY_WINDOW_MS;
  const counts = new Map<string, number>();
  for (const a of articles) {
    if (!a.readAt || a.readAt < cutoff) continue;
    counts.set(a.feedId, (counts.get(a.feedId) ?? 0) + 1);
  }
  const matches: string[] = [];
  for (const [feedId, count] of counts) {
    if (count >= FREQUENCY_THRESHOLD) matches.push(feedId);
  }
  return matches;
}

export async function prefetchStarredArticles(): Promise<Result<PrefetchStats>> {
  const articlesResult = await getAllArticles();
  if (!articlesResult.ok) return err(articlesResult.error);

  const now = Date.now();
  const candidates = articlesResult.value.filter((a) =>
    isPrefetchCandidate(a, now),
  );

  if (candidates.length === 0) {
    return ok({ extracted: 0, failed: 0 });
  }

  const { ok: extracted, failed } = await runWithConcurrency(
    candidates,
    PREFETCH_CONCURRENCY,
    prefetchOne,
  );

  return ok({ extracted, failed });
}
