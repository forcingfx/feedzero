import { extract as defuddleExtract } from "./defuddle-extractor.js";

/**
 * Extract readable content from an HTML page.
 * Delegates to the active extractor implementation (currently Defuddle).
 * Swap the import to use a different library (e.g. Readability).
 */
export const extract = defuddleExtract;

/**
 * Determine whether an article needs full-text extraction.
 * Returns true if the article appears to only have a summary/teaser.
 * @param {object} article - Parsed article with content, summary, and link fields
 * @returns {boolean}
 */
export function needsExtraction(article) {
  if (!article.link || !article.link.startsWith("http")) return false;

  const content = article.content || "";
  const summary = article.summary || "";

  // Has distinct, non-trivial content — no extraction needed
  if (content && content !== summary) return false;

  // Content is empty or identical to summary — check if summary is short enough
  // to be a teaser rather than a complete short article
  return summary.length < 500;
}
