import { ALL_FEEDS_ID } from "@feedzero/core/utils/constants";

/**
 * Where the Feeds tab lands when no feed list has been seen this visit.
 * All items, not the bare /feeds route: with a single feed that route
 * redirects to Explore, and the tab would seem to do nothing.
 */
export const DEFAULT_FEED_LIST_PATH = `/feeds/${ALL_FEEDS_ID}`;

/**
 * The feed-list route a path belongs to, or null when the path is outside
 * the Feeds section. An article route maps to the list it was opened
 * from: coming back to Feeds returns to the list, not into the reader.
 */
export function feedListPath(pathname: string): string | null {
  const match = /^\/feeds(?:\/([^/]+))?(?:\/|$)/.exec(pathname);
  if (!match) return null;
  return match[1] ? `/feeds/${match[1]}` : "/feeds";
}
