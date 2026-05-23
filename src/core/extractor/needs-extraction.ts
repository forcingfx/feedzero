import type { Article } from "../../../packages/core/src/types";

/**
 * Tiny predicate, no Defuddle dependency. Lives in its own module so
 * the reader panel can ask "should we offer the Extract toggle for
 * this article?" without pulling Defuddle's HTML pipeline into the
 * first-paint bundle.
 *
 * Returns true if the article appears to be a teaser (short summary,
 * no distinct content) and has a fetchable link.
 */
export function needsExtraction(article: Article): boolean {
  if (!article.link || !article.link.startsWith("http")) return false;

  const content = article.content || "";
  const summary = article.summary || "";

  // Has distinct, non-trivial content — no extraction needed
  if (content && content !== summary) return false;

  // Content is empty or identical to summary — check if summary is short
  // enough to be a teaser rather than a complete short article.
  return summary.length < 500;
}
