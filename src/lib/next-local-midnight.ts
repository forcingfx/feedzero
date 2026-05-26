/**
 * Returns the timestamp (ms since epoch) of the next 00:00:00 in the
 * browser's local timezone, given a "now" reference Date.
 *
 * Used by the Signal midnight-refresh hook to compute the delta until
 * the next scheduled run. Pure — no `Date.now()`, no globals, so it's
 * trivially testable.
 *
 * Implementation note: `setHours(24, 0, 0, 0)` normalizes to next-day
 * 00:00 even across DST transitions. We do NOT use UTC arithmetic
 * because midnight is a local-time concept; a user in UTC-5 expects
 * the run at their local 00:00, not at 19:00 their time.
 */
export function nextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}
