import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import type { Article, Feed } from "../../../packages/core/src/types";
import { getAllArticles, getFeeds, updateArticles } from "./db.ts";

/**
 * Releasing persisted offline full text, which is what makes a large
 * vault large.
 *
 * Until this existed, nothing in the app released `extractedContent`:
 * unstarring kept it, the per-feed prefetch toggle only stopped new
 * fetches, and the sync size error told users to do both. A user whose
 * vault had outgrown the sync ceiling had no move except deleting the
 * feed.
 *
 * The rule here is narrow on purpose: **the app keeps an offline copy
 * for exactly as long as it would re-fetch one.** Clearing a starred
 * article's copy would free space until the next refresh, when the
 * prefetch service downloads it again — space that comes back is not
 * space, it is churn. So the release covers copies nothing is
 * maintaining, and the user's lever for the rest is to unstar, which
 * now releases the copy as it goes.
 */

export interface OfflineContentRelease {
  /** How many articles lost their offline copy. */
  articlesCleared: number;
}

/**
 * Whether the app would re-fetch this article's offline copy, and so
 * should keep the one it has.
 *
 * `feedsById` is passed in rather than read here so the predicate stays
 * pure and the caller decides how fresh the feed list needs to be.
 */
export function keepsOfflineCopy(
  article: Article,
  feedsById: Map<string, Feed>,
): boolean {
  if (article.starred) return true;
  return feedsById.get(article.feedId)?.prefetchEnabled === true;
}

/**
 * The same article without its offline copy.
 *
 * `extractedAt` goes with the text: leaving the timestamp behind would
 * claim a copy that no longer exists, and the freshness checks read it.
 * Everything the user owns — read state, stars, folder overrides — is
 * untouched.
 */
export function withoutOfflineCopy(article: Article): Article {
  const { extractedContent: _text, extractedAt: _at, ...rest } = article;
  void _text;
  void _at;
  return rest;
}

/**
 * Clear every offline copy the app is no longer maintaining.
 *
 * Writes nothing when there is nothing to release, so the caller can
 * run it without scheduling a pointless sync push.
 */
export async function releaseUnmaintainedOfflineContent(): Promise<
  Result<OfflineContentRelease>
> {
  const [articlesResult, feedsResult] = await Promise.all([
    getAllArticles(),
    getFeeds(),
  ]);
  if (!articlesResult.ok) return articlesResult;
  if (!feedsResult.ok) return feedsResult;

  const feedsById = new Map(feedsResult.value.map((feed) => [feed.id, feed]));
  const released = articlesResult.value
    .filter((article) => article.extractedContent)
    .filter((article) => !keepsOfflineCopy(article, feedsById))
    .map(withoutOfflineCopy);

  if (released.length === 0) return ok({ articlesCleared: 0 });

  const written = await updateArticles(released);
  if (!written.ok) return err(written.error);

  return ok({ articlesCleared: released.length });
}
