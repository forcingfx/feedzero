import { ok } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { DEFAULT_ARTICLE_RETENTION } from "../../../packages/core/src/types";
import type { Article, ArticleRetention, Feed } from "../../../packages/core/src/types";
import {
  getAllArticles,
  getFeeds,
  getPreferences,
  removeArticles,
  updateFeed,
} from "./db.ts";

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

/** A feed item as ingest sees it, before it becomes an Article. */
interface IncomingItem {
  guid: string;
  publishedAt: number | null;
}

/**
 * Whether refresh should store a feed item it has not seen before.
 *
 * Refresh dedupes against stored rows only, so without this a purged
 * article still in the publisher's feed comes back as new and unread.
 * A dated item is judged by age. An undated one gets "now" as its date
 * and always looks new, so it is judged by the feed's retired guids.
 */
export function admitsOnIngest(
  item: IncomingItem,
  cutoff: number | null,
  retiredGuids: ReadonlySet<string>,
): boolean {
  if (item.publishedAt === null) return !retiredGuids.has(item.guid);
  return cutoff === null || item.publishedAt >= cutoff;
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
  const expired = articles.value.filter(
    (a) => isExpired(a, cutoff) && !keep.has(a.id),
  );
  if (expired.length === 0) return ok({ articlesRemoved: 0 });

  const retired = await retireUndatedGuids(expired);
  if (!retired.ok) return retired;
  const removed = await removeArticles(expired.map((a) => a.id));
  if (!removed.ok) return removed;
  return ok({ articlesRemoved: expired.length });
}

/**
 * Record the guids of purged undated articles on their feeds, so refresh
 * does not re-add them. Written before the delete: a failure between the
 * two leaves an article plus its tombstone, never a missing tombstone.
 */
async function retireUndatedGuids(expired: Article[]): Promise<Result<void>> {
  const guidsByFeed = new Map<string, string[]>();
  for (const article of expired.filter((a) => a.datePresumed)) {
    const guids = guidsByFeed.get(article.feedId) ?? [];
    guids.push(article.guid);
    guidsByFeed.set(article.feedId, guids);
  }
  if (guidsByFeed.size === 0) return ok(undefined);

  const feeds = await getFeeds();
  if (!feeds.ok) return feeds;
  for (const feed of feeds.value) {
    const guids = guidsByFeed.get(feed.id);
    if (!guids) continue;
    const written = await updateFeed(withRetiredGuids(feed, guids));
    if (!written.ok) return written;
  }
  return ok(undefined);
}

function withRetiredGuids(feed: Feed, guids: string[]): Feed {
  const retiredGuids = [...new Set([...(feed.retiredGuids ?? []), ...guids])];
  return { ...feed, retiredGuids };
}
