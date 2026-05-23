import type { Article } from "@feedzero/core/types";

/**
 * Pick the best available extracted-content source for an article.
 *
 * Precedence:
 *   1. `article.extractedContent` — persisted by the background prefetch
 *      service. Survives reload, syncs across devices.
 *   2. `cache[article.link]` — in-memory on-demand cache from the
 *      extraction store. Populated when the user clicks "Full text".
 *
 * Returns `undefined` when neither source has content. Empty strings in
 * `extractedContent` are treated as missing — a zero-length persistence
 * means "we tried and got nothing"; the cache may have a real retry.
 */
export function pickExtractedContent(
  article: Article,
  cache: Record<string, string>,
): string | undefined {
  if (article.extractedContent && article.extractedContent.length > 0) {
    return article.extractedContent;
  }
  if (!article.link) return undefined;
  return cache[article.link];
}
