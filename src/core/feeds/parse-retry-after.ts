/**
 * Parse an HTTP `Retry-After` header value into an absolute resume
 * timestamp (ms since epoch).
 *
 * Two RFC 7231 §7.1.3 forms:
 *   - delta-seconds: an integer count of seconds (e.g. "60")
 *   - HTTP-date:     an RFC 7231 date string (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
 *
 * Returns null on malformed input — caller's contract is "no pause was
 * specified," distinct from a 0 pause ("retry immediately").
 *
 * Two safety clamps:
 *   - Past / negative values → NOW (don't create permanent "paused since
 *     1970" state from clock skew or an upstream typo).
 *   - Cap at 24h. A misconfigured upstream sending 30-day Retry-After
 *     would otherwise silently disappear feeds for a month.
 *
 * Pure: `now` is injected so tests are deterministic and time-zone-free.
 */
const MAX_PAUSE_MS = 24 * 3600 * 1000;

export function parseRetryAfter(
  value: string | null | undefined,
  now: number,
): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Form 1: delta-seconds (allow negatives so we can clamp them).
  if (/^-?\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return clamp(now + seconds * 1000, now);
  }

  // Form 2: HTTP-date.
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return clamp(dateMs, now);
}

function clamp(target: number, now: number): number {
  if (target < now) return now;
  if (target - now > MAX_PAUSE_MS) return now + MAX_PAUSE_MS;
  return target;
}
