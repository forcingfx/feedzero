/**
 * Stripe webhook event-id deduplication.
 *
 * Stripe documents that "webhook endpoints occasionally receive the same
 * event multiple times" — primarily from automatic retries on non-2xx
 * responses (up to 3 days in live mode) and manual resends from the
 * dashboard or CLI. Without dedup, our LicenseIssuer would mint a second
 * license token for the same Stripe subscription on every retry.
 *
 * Pattern (per Stripe docs and Redis distributed-lock best practice):
 *   - Atomic SET NX (set-if-not-exists) on `stripe:event:<event.id>`
 *   - TTL ≥ 3 days (Stripe's longest retry window). We use 7 days for headroom.
 *   - Returns true on first sight (caller proceeds with dispatch),
 *     false on duplicate (caller skips with 200 alreadyProcessed).
 *
 * Why a Redis SET NX (not a check-then-write):
 *   - Concurrent retries hit different function instances on Vercel.
 *     Without atomicity, two simultaneous retries both read "not seen",
 *     both write, both dispatch — issuer mints two tokens.
 *   - SET NX is the canonical Redis primitive for "atomic create-if-absent".
 *
 * The store is intentionally Stripe-event-shaped, not a generic
 * "have-i-seen-this-string" key-value. Keeping it scoped means we can
 * specialize key shape, TTL, and behavior independently of license storage.
 */

import { type Result, ok, err } from "../../../packages/core/src/utils/result";
import { markTestOnly } from "../test-only-brand";

/**
 * Subset of the Upstash Redis client used by {@link UpstashSeenEventStore}.
 * Defined here narrowly so test fakes don't need to satisfy the full SDK.
 */
export interface UpstashClientForEvents {
  set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<unknown>;
}

export interface SeenEventStore {
  /**
   * Atomically mark `eventId` as seen.
   *
   * @returns ok(true)  if the eventId is new (caller should dispatch).
   *          ok(false) if the eventId was already seen (caller should skip
   *                     and respond 200 alreadyProcessed).
   *          err(...)  on storage failure (caller returns 500 so Stripe retries).
   */
  markSeenIfNew(eventId: string): Promise<Result<boolean>>;
}

const KEY_PREFIX = "stripe:event:";
/** 7 days — comfortably past Stripe's 3-day live-mode retry window. */
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * In-memory implementation. Used by tests, the dev server, and as the
 * reference implementation that pins the contract. Production uses
 * {@link UpstashSeenEventStore}.
 *
 * Memory has no TTL — entries live until process restart. That's acceptable
 * for dev because a process-local restart effectively "expires" everything.
 */
export class MemorySeenEventStore implements SeenEventStore {
  private readonly seen = new Set<string>();

  constructor() {
    markTestOnly(this);
  }

  async markSeenIfNew(eventId: string): Promise<Result<boolean>> {
    if (this.seen.has(eventId)) return ok(false);
    this.seen.add(eventId);
    return ok(true);
  }
}

/**
 * Upstash Redis-backed implementation. Uses SET NX EX for atomic
 * check-and-set. Concurrent retries to different Vercel function instances
 * see consistent dedup because Upstash operations are atomic at the
 * Redis-key level.
 */
export class UpstashSeenEventStore implements SeenEventStore {
  constructor(
    private readonly client: UpstashClientForEvents,
    private readonly ttlSec: number = DEFAULT_TTL_SEC,
  ) {}

  async markSeenIfNew(eventId: string): Promise<Result<boolean>> {
    try {
      const result = await this.client.set(KEY_PREFIX + eventId, "1", {
        nx: true,
        ex: this.ttlSec,
      });
      // Upstash returns "OK" on success, null when NX condition failed.
      return ok(result === "OK");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`upstash seen-event-store error: ${message}`);
    }
  }
}
