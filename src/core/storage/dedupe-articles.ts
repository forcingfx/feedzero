import type { Article } from "../../types/index.ts";

/**
 * Collapse duplicate copies of one article (same feedId+guid) into a single
 * record, preserving the strongest user state across every copy so a read,
 * starred, muted, or extracted article never resurfaces after dedup.
 *
 * Content fields (title, body, summary, …) are taken from `base`; only
 * user-state flags are folded in from the duplicates. `base.id` survives as
 * the keeper's primary key. Pure — no storage or crypto access — so the
 * merge policy is unit-testable in isolation.
 */
export function mergeDuplicateArticles(
  base: Article,
  others: Article[],
): Article {
  const merged: Article = { ...base };
  for (const copy of others) {
    if (copy.read) merged.read = true;
    if (copy.readAt !== undefined)
      merged.readAt = Math.max(merged.readAt ?? 0, copy.readAt);
    if (copy.starred) merged.starred = true;
    if (copy.starredAt !== undefined)
      merged.starredAt = Math.max(merged.starredAt ?? 0, copy.starredAt);
    if (copy.muted) merged.muted = true;
    if (
      merged.extractedContent === undefined &&
      copy.extractedContent !== undefined
    ) {
      merged.extractedContent = copy.extractedContent;
      merged.extractedAt = copy.extractedAt;
    }
    if (merged.folderId === undefined && copy.folderId !== undefined)
      merged.folderId = copy.folderId;
  }
  return merged;
}
