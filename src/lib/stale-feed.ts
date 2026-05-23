import type { Feed } from "@feedzero/core/types";

/**
 * A feed is considered "stale" after 14 days of silent failure — i.e. we
 * tried to fetch since then (lastFetchedAt is recent) but never succeeded
 * (lastSuccessfulFetchAt is older than the threshold or undefined). The
 * threshold is generous because legitimate feeds publish irregularly; we
 * want to surface dead RSS endpoints, not impatient ones.
 */
export const STALE_FEED_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True if the feed was last reached more than 14 days ago AND we have at
 * least one refresh attempt since then. A brand-new feed (no
 * lastFetchedAt yet) is not stale — we haven't tried.
 */
export function isFeedStale(feed: Feed, now: number = Date.now()): boolean {
  const fetched = feed.lastFetchedAt;
  if (fetched === undefined) return false;
  const success = feed.lastSuccessfulFetchAt;
  if (success === undefined) {
    // We've tried, never succeeded. Stale once the first attempt is old.
    return now - fetched > STALE_FEED_THRESHOLD_MS;
  }
  return now - success > STALE_FEED_THRESHOLD_MS;
}
