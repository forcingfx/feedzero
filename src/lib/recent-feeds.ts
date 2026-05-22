import type { Feed } from "@/types/index.ts";

/**
 * Max favicons rendered in the closed mobile-drawer quick-switch dock.
 * Feeds past this count live behind the "open full list" chevron — the
 * strip is only 60px tall and a fixed cap keeps the open-list trigger
 * reachable on the narrowest phones.
 */
export const MOBILE_DOCK_FEED_CAP = 6;

/** Upper bound on the persisted recency list. */
export const RECENT_LIST_CAP = 20;

/**
 * Return the recency list with `feedId` promoted to most-recent (front),
 * deduplicated, and capped. Pure — the store owns persistence.
 */
export function recordRecentFeed(recent: string[], feedId: string): string[] {
  return [feedId, ...recent.filter((id) => id !== feedId)].slice(0, RECENT_LIST_CAP);
}

/**
 * Order `feeds` most-recently-viewed first. Feeds present in `recentIds`
 * lead, in recency order; feeds never viewed follow in their incoming
 * order. Recency ids with no matching feed (deleted since last view) are
 * dropped.
 */
export function orderFeedsByRecency(feeds: Feed[], recentIds: string[]): Feed[] {
  const byId = new Map(feeds.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const ordered: Feed[] = [];

  for (const id of recentIds) {
    const feed = byId.get(id);
    if (feed && !seen.has(id)) {
      ordered.push(feed);
      seen.add(id);
    }
  }
  for (const feed of feeds) {
    if (!seen.has(feed.id)) {
      ordered.push(feed);
      seen.add(feed.id);
    }
  }
  return ordered;
}
