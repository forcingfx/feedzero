/**
 * Per-host pause state for the refresh worker.
 *
 * When an upstream returns 429 or 503 with a `Retry-After` header, the
 * refresh worker records a pause: until the indicated time, every feed
 * on the same host is skipped instead of re-fired. This is the
 * client-side companion to the per-host serialization in
 * `groupByHostForRefresh` — together they protect bursty self-host
 * deployments and well-behaved cloud upstreams from refresh-storm
 * lockout (ADR 014 A4-extras).
 *
 * State lives in a module-level Map. The refresh worker is process-local,
 * so the singleton fits — no cross-tab state, no persistence: a fresh
 * process simply starts with an empty map and learns again on the first
 * 429. `clearHostPauses()` exists for test setup/teardown.
 *
 * Pause-by-host (not by URL): a 429 on `/a.xml` means the upstream is
 * rate-limiting the *origin*, not the path. Skipping every feed on the
 * host until the window expires is correct.
 *
 * Extend-never-shorten: two near-simultaneous 429s with different
 * Retry-After values must not let the shorter one cut the longer one
 * short. The map keeps `max(existing, new)`.
 */

import { parseRetryAfter } from "./parse-retry-after.ts";

const hostPauseMap = new Map<string, number>();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Reset all recorded pauses. Test-only — production runs of the worker
 *  simply outlive the pauses via the time check in `hostPausedUntil`. */
export function clearHostPauses(): void {
  hostPauseMap.clear();
}

/**
 * Record that the host of `url` is paused until `untilMs`. Extends an
 * existing pause to the later value; never shortens it.
 */
export function registerHostPause(url: string, untilMs: number): void {
  const host = hostOf(url);
  if (!host) return;
  const existing = hostPauseMap.get(host) ?? 0;
  if (untilMs > existing) hostPauseMap.set(host, untilMs);
}

/**
 * Returns the pause expiry (ms epoch) if the host of `url` is currently
 * paused at `now`, or null if there is no active pause. Expired pauses
 * are GC'd as a side effect to keep the map small.
 */
export function hostPausedUntil(url: string, now: number): number | null {
  const host = hostOf(url);
  if (!host) return null;
  const until = hostPauseMap.get(host);
  if (until === undefined) return null;
  if (until <= now) {
    hostPauseMap.delete(host);
    return null;
  }
  return until;
}

interface ResponseLike {
  status: number;
  headers?: { get?: (key: string) => string | null };
}

/**
 * Inspect a refresh response and, if it's a 429/503 carrying a
 * `Retry-After` header, register a host pause. No-op for other statuses
 * (Retry-After is only contractually meaningful on 429/503 per
 * RFC 7231 §7.1.3).
 */
export function recordHostPauseFromResponse(
  url: string,
  response: ResponseLike,
  now: number,
): void {
  if (response.status !== 429 && response.status !== 503) return;
  const retryAfterHeader = response.headers?.get?.("retry-after") ?? null;
  const untilMs = parseRetryAfter(retryAfterHeader, now);
  if (untilMs === null) return;
  registerHostPause(url, untilMs);
}
