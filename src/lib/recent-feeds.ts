import type { Feed } from "@feedzero/core/types";

/**
 * Max favicons rendered in the closed mobile-drawer quick-switch dock.
 * Feeds past this count live behind the "open full list" chevron — the
 * strip is only 60px tall and a fixed cap keeps the open-list trigger
 * reachable on the narrowest phones.
 */
// 4, not 6: the strip now also carries fixed Explore + Settings icons.
// 4 favicons + All-items + the three fixed buttons fit a 360px-wide
// phone without clipping inside the overflow-hidden favicon area.
export const MOBILE_DOCK_FEED_CAP = 4;

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
 * Pick the feeds for the mobile dock's quick-switch slots.
 *
 * Recency decides MEMBERSHIP (the `cap` most-recently-viewed feeds,
 * padded with never-viewed feeds); the sidebar `feeds` order decides
 * POSITION. Splitting the two is the point: tapping a feed that is
 * already in the dock changes its recency but not the dock's makeup,
 * so the buttons never reorder under the user's thumb. Only viewing a
 * feed from outside the dock swaps a member out — a rare, expected
 * change instead of a shuffle on every selection.
 */
export function stableDockFeeds(
  feeds: Feed[],
  recentIds: string[],
  cap: number,
): Feed[] {
  const knownIds = new Set(feeds.map((f) => f.id));
  const members = new Set<string>();
  for (const id of recentIds) {
    if (members.size >= cap) break;
    if (knownIds.has(id)) members.add(id);
  }
  for (const feed of feeds) {
    if (members.size >= cap) break;
    members.add(feed.id);
  }
  return feeds.filter((f) => members.has(f.id));
}
