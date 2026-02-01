import { registry } from "./adapters/index.ts";
import { defaultAdapter } from "./adapters/default-adapter.ts";
import type { Article } from "../../types/index.ts";
import type { Result } from "../../utils/result.ts";
import type { ExtractionResult } from "./defuddle-extractor.ts";

/**
 * Extract readable content from fetched text.
 * Routes to a domain-specific adapter if one is registered,
 * otherwise falls back to the default Defuddle extractor.
 */
export function extract(text: string, url: string): Result<ExtractionResult> {
  const adapter = registry.findAdapter(url) ?? defaultAdapter;
  return adapter.extract(text, url);
}

/**
 * Determine whether an article needs full-text extraction.
 * Returns true if the article appears to only have a summary/teaser.
 */
export function needsExtraction(article: Article): boolean {
  if (!article.link || !article.link.startsWith("http")) return false;

  const content = article.content || "";
  const summary = article.summary || "";

  // Has distinct, non-trivial content — no extraction needed
  if (content && content !== summary) return false;

  // Content is empty or identical to summary — check if summary is short enough
  // to be a teaser rather than a complete short article
  return summary.length < 500;
}
