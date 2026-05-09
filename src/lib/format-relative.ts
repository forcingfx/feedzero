const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Newspaper-style relative date label: "now", "5m ago", "2h ago",
 * "yesterday", "3d ago", or an absolute month/day for older items.
 *
 * Pure for ease of testing — caller passes `now` explicitly.
 */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  if (!timestamp || Number.isNaN(timestamp)) return "";
  const diff = now - timestamp;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
