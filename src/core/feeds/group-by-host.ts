/**
 * Group feeds into refresh batches with two invariants:
 *
 *   1. No two feeds in the same batch share a host. This serializes
 *      requests per upstream so a bulk refresh doesn't trip per-IP rate
 *      limits — the self-host symptom from feedback #97. Cross-host
 *      parallelism is preserved.
 *   2. Each batch has at most `concurrency` feeds. Caps overall load.
 *
 * Pure function. Feeds with unparseable URLs go into their own batches
 * rather than being dropped silently — we'd rather refresh them than
 * lose them just because URL parsing failed.
 *
 * A greedy first-fit packing is sufficient here: feeds within a host
 * have no ordering constraint other than "not concurrently," and the
 * upstream rate-limit window is much longer than the time between
 * sequential batches, so packing efficiency at the batch level is what
 * matters.
 */

export interface RefreshTarget {
  url: string;
}

export function groupByHostForRefresh<T extends RefreshTarget>(
  feeds: readonly T[],
  concurrency: number,
): T[][] {
  if (feeds.length === 0) return [];

  const batches: T[][] = [];

  for (const feed of feeds) {
    const host = safeHost(feed.url);
    const placed = tryPlaceInExistingBatch(batches, feed, host, concurrency);
    if (!placed) batches.push([feed]);
  }

  return batches;
}

function tryPlaceInExistingBatch<T extends RefreshTarget>(
  batches: T[][],
  feed: T,
  host: string | null,
  concurrency: number,
): boolean {
  for (const batch of batches) {
    if (batch.length >= concurrency) continue;
    if (host === null) continue;
    const conflict = batch.some((existing) => safeHost(existing.url) === host);
    if (!conflict) {
      batch.push(feed);
      return true;
    }
  }
  return false;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
