import type { Feed } from "../../types/index.ts";

/**
 * Threshold of consecutive 304 Not Modified responses at which we
 * start stretching the refresh interval. The first two 304s leave the
 * feed on its default cadence so we don't over-react to brief quiet
 * periods on otherwise-active publishers.
 */
const BACKOFF_THRESHOLD = 3;

/**
 * Multipliers applied to the default refresh interval once
 * BACKOFF_THRESHOLD is crossed. Cap at 4× so even the quietest feed
 * still attempts a refresh roughly every 2 hours on a 30-minute base —
 * publishers who add content infrequently still surface that content
 * within one reading session.
 */
const BACKOFF_MULTIPLIERS = [2, 4] as const;
const BACKOFF_CAP = BACKOFF_MULTIPLIERS[BACKOFF_MULTIPLIERS.length - 1];

/**
 * Compute the effective refresh interval for a feed, accounting for any
 * consecutive 304 Not Modified streak the publisher has produced. A
 * feed that's responded "nothing changed" 3+ times in a row likely
 * publishes infrequently; stretching its interval reduces refresh
 * network traffic without delaying real updates beyond ~2 hours.
 *
 * Pure function — takes the feed and the default cadence; returns a
 * new interval in ms. Caller decides what "default" means (auto-refresh
 * uses AUTO_REFRESH_INTERVAL_MS).
 */
export function effectiveRefreshIntervalMs(
  feed: Feed,
  defaultMs: number,
): number {
  const count = feed.consecutive304Count ?? 0;
  if (count < BACKOFF_THRESHOLD) return defaultMs;
  // count >= 3 → first multiplier; count >= 4 → second multiplier; capped.
  const step = Math.min(
    count - BACKOFF_THRESHOLD,
    BACKOFF_MULTIPLIERS.length - 1,
  );
  const multiplier = BACKOFF_MULTIPLIERS[step] ?? BACKOFF_CAP;
  return defaultMs * multiplier;
}

/**
 * Whether a feed is due for an auto-refresh pass given the default
 * cadence. Always due if the feed has never been refreshed. Otherwise
 * compares the elapsed time since the last attempt against the
 * effective (possibly backed-off) interval.
 *
 * This is the gate the bulk auto-refresh uses to skip quiet feeds.
 * Single-feed refresh (user-triggered) and the manual "Refresh All"
 * button intentionally bypass this — when a user clicks refresh they
 * want the publisher actually queried, regardless of backoff.
 */
export function isFeedDueForRefresh(
  feed: Feed,
  now: number,
  defaultMs: number,
): boolean {
  if (!feed.lastFetchedAt) return true;
  const interval = effectiveRefreshIntervalMs(feed, defaultMs);
  return now - feed.lastFetchedAt >= interval;
}
