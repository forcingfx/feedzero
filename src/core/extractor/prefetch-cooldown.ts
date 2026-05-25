/**
 * Shared cooldown signal for the page-extraction rate-limit path.
 *
 * Both the user-initiated extraction click (`extraction-store.fetchExtracted`)
 * and the background prefetch worker (`prefetch-service.prefetchOne`) hit the
 * same `/api/page` endpoint, which is metered by a shared 300-req/60s
 * proxy rate limiter. Without coordination, a refresh-triggered prefetch
 * burst can exhaust the bucket, after which every manual "Full text"
 * click 429s silently for the rest of the window.
 *
 * Whoever observes a 429 first signals the cooldown; the prefetch worker
 * consults this module before scheduling new work, so it gets out of the
 * user's way for the duration of the publisher's Retry-After window.
 *
 * Module-level state is intentional — it's a process-wide "the proxy
 * just told us to back off" flag. Tests reset it via `clearCooldown`.
 */

let cooldownUntilMs = 0;

/**
 * Record that the proxy returned 429. `retryAfterSec` is the value of
 * the upstream `Retry-After` header (defaults to 60s at the limiter).
 * Non-positive values are ignored — defensive against an upstream that
 * forgets the header or sends `0`.
 *
 * Monotonic: a longer signal extends the cooldown, a shorter signal
 * never shortens it. The longest observed window wins so prefetch
 * doesn't resume mid-block when the user gets a follow-up 429 with a
 * smaller retry value.
 */
export function signalRateLimited(
  retryAfterSec: number,
  now: number = Date.now(),
): void {
  if (retryAfterSec <= 0) return;
  const candidate = now + retryAfterSec * 1000;
  if (candidate > cooldownUntilMs) cooldownUntilMs = candidate;
}

/** Whether we're currently in the cooldown window. */
export function isInCooldown(now: number = Date.now()): boolean {
  return cooldownUntilMs > now;
}

/** Milliseconds left in the cooldown window; 0 once elapsed. */
export function cooldownRemainingMs(now: number = Date.now()): number {
  const remaining = cooldownUntilMs - now;
  return remaining > 0 ? remaining : 0;
}

/** Reset cooldown state. Tests only — production never needs to clear. */
export function clearCooldown(): void {
  cooldownUntilMs = 0;
}
