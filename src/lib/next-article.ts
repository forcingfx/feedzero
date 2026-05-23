import type { Article } from "@feedzero/core/types";

/**
 * Find the article that follows `current` in the loaded list.
 * Returns null when at the end, not in the list, or no current article.
 */
export function findNextArticle(
  articles: Article[],
  current: Article | null,
): Article | null {
  if (!current) return null;
  const idx = articles.findIndex((a) => a.id === current.id);
  if (idx < 0 || idx >= articles.length - 1) return null;
  return articles[idx + 1];
}

/**
 * Find the article that precedes `current` in the loaded list.
 * Returns null when at the start, not in the list, or no current article.
 */
export function findPrevArticle(
  articles: Article[],
  current: Article | null,
): Article | null {
  if (!current) return null;
  const idx = articles.findIndex((a) => a.id === current.id);
  if (idx <= 0) return null;
  return articles[idx - 1];
}
