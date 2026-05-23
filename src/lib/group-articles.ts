import type { Article } from "@feedzero/core/types";
import { ARTICLE_GROUPING } from "@feedzero/core/utils/constants";

/**
 * A stacked "flood" of consecutive same-feed articles within the
 * grouping window. Created by {@link groupArticles} when at least
 * {@link ARTICLE_GROUPING.MIN_GROUP_SIZE} adjacent items satisfy the
 * pairwise-delta rule.
 */
export interface ArticleGroup {
  kind: "group";
  /** Stable id derived from feedId, head article id, and group length. */
  id: string;
  feedId: string;
  /** Source articles, preserved in the publishedAt-desc order of the input. */
  articles: Article[];
}

/** Wrapper for a single article that didn't qualify for grouping. */
export interface ArticleEntry {
  kind: "article";
  article: Article;
}

export type ArticleListEntry = ArticleEntry | ArticleGroup;

interface GroupingThreshold {
  WINDOW_MS: number;
  MIN_GROUP_SIZE: number;
}

/**
 * Collapse consecutive same-feed articles into stacked groups when their
 * pairwise (adjacent) publishedAt deltas all stay within `WINDOW_MS`.
 *
 * Input must already be sorted by publishedAt descending — the article
 * store and the per-feed DB query both guarantee this. The walk is O(n)
 * single-pass; a "run" of candidate articles accumulates and is flushed
 * either as a group (length ≥ MIN_GROUP_SIZE) or as individual entries.
 *
 * Why pairwise (not window-from-first): an aggregator that posts every
 * 8 minutes for 2 hours should appear as ONE stack. Window-from-first
 * would arbitrarily split it at the 10-minute mark.
 *
 * Articles with `publishedAt <= 0` are never grouped — protects against
 * feeds with missing/bad timestamps, which would otherwise have delta=0
 * and collapse into one giant stack.
 */
export function groupArticles(
  articles: Article[],
  threshold: GroupingThreshold = ARTICLE_GROUPING,
): ArticleListEntry[] {
  if (
    threshold.MIN_GROUP_SIZE > articles.length ||
    threshold.MIN_GROUP_SIZE < 2
  ) {
    return articles.map((article) => ({ kind: "article", article }));
  }

  const out: ArticleListEntry[] = [];
  let run: Article[] = [];

  const flush = () => {
    if (run.length >= threshold.MIN_GROUP_SIZE) {
      const head = run[0]!;
      out.push({
        kind: "group",
        id: `g:${head.feedId}:${head.id}:${run.length}`,
        feedId: head.feedId,
        articles: run,
      });
    } else {
      for (const article of run) out.push({ kind: "article", article });
    }
    run = [];
  };

  for (const article of articles) {
    if (run.length === 0) {
      run.push(article);
      continue;
    }
    const prev = run[run.length - 1]!;
    const validTimestamps = prev.publishedAt > 0 && article.publishedAt > 0;
    const sameFeed = prev.feedId === article.feedId;
    // Desc order → prev.publishedAt >= article.publishedAt, so delta ≥ 0.
    const withinWindow =
      prev.publishedAt - article.publishedAt <= threshold.WINDOW_MS;

    if (validTimestamps && sameFeed && withinWindow) {
      run.push(article);
    } else {
      flush();
      run.push(article);
    }
  }
  flush();

  return out;
}
