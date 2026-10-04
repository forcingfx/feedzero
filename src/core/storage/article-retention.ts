import { ok } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { DEFAULT_ARTICLE_RETENTION } from "../../../packages/core/src/types";
import type { Article, ArticleRetention } from "../../../packages/core/src/types";
import { getAllArticles, getPreferences, removeArticles } from "./db.ts";

/**
 * Article retention: unstarred articles published longer ago than the
 * user's retention period are deleted, read or unread.
 *
 * Starring is the one way to keep an old article, so the rule needs no
 * exceptions list. Unread articles are not spared: a feed nobody reads is
 * exactly the one that would otherwise grow the vault without bound.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The retention periods the user can pick, shortest first. */
export const ARTICLE_RETENTION_OPTIONS: readonly ArticleRetention[] = [
  7, 14, 30, 90, 365, "never",
];

export interface ArticleRetentionPurge {
  /** How many articles were deleted. */
  articlesRemoved: number;
}

interface PurgeOptions {
  /** Epoch ms to measure age from; defaults to the current time. */
  now?: number;
  /**
   * Article ids to spare this pass, whatever their age: the article open
   * in the reader, so a purge never pulls it out from under the user.
   */
  keep?: ReadonlySet<string>;
}

/** Epoch ms before which an article is expired, or null for "never". */
export function retentionCutoff(
  retention: ArticleRetention,
  now: number,
): number | null {
  return retention === "never" ? null : now - retention * DAY_MS;
}

/** Whether retention removes this article, given the cutoff. */
export function isExpired(article: Article, cutoff: number | null): boolean {
  if (cutoff === null || article.starred) return false;
  return article.publishedAt < cutoff;
}

/**
 * The vault's retention period. A vault that never chose one (every vault
 * created before retention existed) gets the default, so it starts being
 * purged on upgrade.
 */
export async function loadArticleRetention(): Promise<Result<ArticleRetention>> {
  const prefs = await getPreferences();
  if (!prefs.ok) return prefs;
  return ok(prefs.value?.articleRetention ?? DEFAULT_ARTICLE_RETENTION);
}

/**
 * Count the articles a retention period would remove, without deleting
 * anything. Lets the UI say "this removes N articles" before it does.
 */
export async function countExpiredArticles(
  retention: ArticleRetention,
  now = Date.now(),
): Promise<Result<number>> {
  const articles = await getAllArticles();
  if (!articles.ok) return articles;
  const cutoff = retentionCutoff(retention, now);
  return ok(articles.value.filter((a) => isExpired(a, cutoff)).length);
}

/**
 * Delete every article the vault's retention period has expired.
 *
 * Writes nothing when nothing has expired, so the caller can run it after
 * every refresh without scheduling a pointless sync push.
 */
export async function purgeExpiredArticles({
  now = Date.now(),
  keep = new Set(),
}: PurgeOptions = {}): Promise<Result<ArticleRetentionPurge>> {
  const retention = await loadArticleRetention();
  if (!retention.ok) return retention;
  const cutoff = retentionCutoff(retention.value, now);
  if (cutoff === null) return ok({ articlesRemoved: 0 });

  const articles = await getAllArticles();
  if (!articles.ok) return articles;
  const expiredIds = articles.value
    .filter((a) => isExpired(a, cutoff) && !keep.has(a.id))
    .map((a) => a.id);
  if (expiredIds.length === 0) return ok({ articlesRemoved: 0 });

  const removed = await removeArticles(expiredIds);
  if (!removed.ok) return removed;
  return ok({ articlesRemoved: expiredIds.length });
}
