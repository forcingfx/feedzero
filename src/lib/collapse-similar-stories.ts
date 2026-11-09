import type { Article, SimilarityLevel } from "@feedzero/core/types";
import { tokenize } from "@/core/signal/tokenize.ts";

/** One story as the list shows it: the newest copy, plus the copies folded under it. */
export interface SimilarStory {
  lead: Article;
  duplicates: Article[];
}

/**
 * Minimum Jaccard overlap of title tokens for two articles to count as the
 * same story. Normal matches Signal's STORY_SIMILARITY; Loose and Strict sit
 * either side of it.
 */
export const SIMILARITY_THRESHOLD: Record<SimilarityLevel, number> = {
  loose: 0.4,
  normal: 0.6,
  strict: 0.8,
};

/**
 * Fold near-identical headlines under the newest copy (issue #343).
 *
 * Input is publishedAt-descending, as the article store guarantees, so the
 * first article of each story is its lead. Each later article joins the
 * first existing story whose lead title overlaps enough; titles that
 * tokenize to nothing never match anything. Same single-pass shape as
 * Signal's `groupIntoStories`, but compared against the lead only, so a
 * chain of loosely related titles cannot drift into one story.
 */
export function collapseSimilarStories(
  articles: readonly Article[],
  level: SimilarityLevel,
): SimilarStory[] {
  const threshold = SIMILARITY_THRESHOLD[level];
  const stories: { story: SimilarStory; tokens: Set<string> }[] = [];

  for (const article of articles) {
    const tokens = new Set(tokenize(article.title));
    const match =
      tokens.size === 0
        ? undefined
        : stories.find((s) => jaccard(tokens, s.tokens) >= threshold);
    if (match) {
      match.story.duplicates.push(article);
    } else {
      stories.push({ story: { lead: article, duplicates: [] }, tokens });
    }
  }

  return stories.map((s) => s.story);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
