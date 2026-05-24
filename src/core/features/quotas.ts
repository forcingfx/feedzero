/**
 * Quota gating — currently the 50-feed cap on hosted Free.
 *
 * Distinct from `feature-gates.ts` because quotas are continuous (a count
 * compared against a limit) rather than binary (do I have this capability).
 * Both modules share the same `Tier` model from license-store, the same
 * self-hosted bypass from `self-hosted.ts`, and now the same canonical
 * source: `tier-matrix.ts`.
 *
 * Honor-system enforcement: the server cannot read decrypted feed count out
 * of the zero-knowledge sync vault, so the limit lives in the client. A
 * determined user could fork and strip the gate, which is effectively
 * self-hosting; the price-vs-friction calculus resolves the same way (see
 * ADR 012 for the open-core rationale).
 */

import type { Tier } from "./feature-gates";
import { getLimit } from "./tier-matrix";

/**
 * Maximum feed subscriptions on hosted Free tier. Sourced from the
 * canonical tier matrix so changes to the cap happen in exactly one
 * place. The non-null assertion is safe because the matrix declares
 * `feed-subscriptions` as available on `free` with a numeric limit;
 * tests verify both invariants.
 */
export const FREE_FEED_LIMIT = getLimit("feed-subscriptions", "free") as number;

/**
 * Maximum saved Signal Briefings on a paid tier. Sourced from the
 * matrix so re-tiering or cap changes happen in exactly one place.
 * Currently the same on Personal and Pro; if they ever diverge,
 * `checkBriefingQuota` reads the per-tier limit from the matrix
 * directly and this constant becomes a convenience.
 */
export const BRIEFINGS_LIMIT = getLimit("signal-briefings", "personal") as number;

export type QuotaCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "free-quota-exceeded";
      limit: number;
      current: number;
      delta: number;
    };

export interface FeedQuotaArgs {
  /** Current feed count on the user's account. */
  currentCount: number;
  /** Number of feeds about to be added (1 for addFeed, N for OPML import). */
  delta?: number;
  tier: Tier;
  isSelfHosted: boolean;
  /**
   * Whether the paid tier is active in this build (read from
   * `VITE_PAID_TIER_VISIBLE` via `isPaidTierActive()`). When false, the
   * paid tier is dormant — Subscribe surfaces are hidden, /api/sync is
   * unauthenticated, and Free users get full functionality (no quota
   * cap). The cap is only meaningful once the upgrade path exists.
   */
  paidTierActive: boolean;
}

/**
 * Decide whether adding `delta` (default 1) more feeds is allowed under the
 * current tier, self-hosted state, and paid-tier launch state.
 *
 * Returns `ok: true` when:
 *  - the paid tier is dormant (pre-launch — no upgrade path exists yet,
 *    so the cap would only frustrate users),
 *  - the user is on a paid tier (personal or pro),
 *  - the user is self-hosted, or
 *  - the total after the add is at or below FREE_FEED_LIMIT.
 *
 * Returns a structured error otherwise so the UI can render an Upgrade prompt
 * with the actual numbers.
 */
export function checkFeedQuota(args: FeedQuotaArgs): QuotaCheck {
  const delta = args.delta ?? 1;
  if (!args.paidTierActive) return { ok: true };
  if (args.tier !== "free") return { ok: true };
  if (args.isSelfHosted) return { ok: true };
  if (args.currentCount + delta > FREE_FEED_LIMIT) {
    return {
      ok: false,
      reason: "free-quota-exceeded",
      limit: FREE_FEED_LIMIT,
      current: args.currentCount,
      delta,
    };
  }
  return { ok: true };
}

/** Human-readable quota error message for surfaces that need it inline. */
export function quotaErrorMessage(check: Exclude<QuotaCheck, { ok: true }>): string {
  if (check.delta === 1) {
    return `You've reached the Free limit of ${check.limit} feeds. Subscribe to Personal for unlimited, or self-host with VITE_SELF_HOSTED=1.`;
  }
  return `Importing ${check.delta} feeds would exceed the Free limit of ${check.limit} (you have ${check.current}). Subscribe to Personal for unlimited, or self-host with VITE_SELF_HOSTED=1.`;
}

// ── Signal Briefings quota ─────────────────────────────────────────────

export type BriefingQuotaCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "quota-exceeded";
      limit: number;
      current: number;
      delta: number;
    };

export interface BriefingQuotaArgs {
  /** Current saved-briefing count on the user's account. */
  currentCount: number;
  /** Number of briefings about to be created (defaults to 1). */
  delta?: number;
  tier: Tier;
  isSelfHosted: boolean;
  paidTierActive: boolean;
}

/**
 * Decide whether creating `delta` (default 1) more briefings is allowed.
 *
 * Free users are blocked by `feature-gates.gateState` upstream (the binary
 * capability gate); this function enforces the numeric cap for any tier
 * that has a per-tier limit set in the matrix. Mirrors `checkFeedQuota`
 * for bypass behaviour:
 *
 *  - `paidTierActive: false`   → ok (pre-launch — no upgrade path exists).
 *  - `isSelfHosted: true`       → ok (unlimited).
 *  - tier has no matrix limit   → ok (feature gate already blocked the call,
 *                                  or the tier is uncapped / unlimited).
 *  - over cap                   → not ok with structured error.
 *
 * Matrix-derived: re-tiering Signal Briefings in `tier-matrix.ts` flows
 * through here automatically — the per-tier limit comes from
 * `getLimit("signal-briefings", tier)`.
 */
export function checkBriefingQuota(args: BriefingQuotaArgs): BriefingQuotaCheck {
  const delta = args.delta ?? 1;
  if (!args.paidTierActive) return { ok: true };
  if (args.isSelfHosted) return { ok: true };
  const limit = getLimit("signal-briefings", args.tier);
  if (limit === undefined || limit === "unlimited") return { ok: true };
  if (args.currentCount + delta > limit) {
    return {
      ok: false,
      reason: "quota-exceeded",
      limit,
      current: args.currentCount,
      delta,
    };
  }
  return { ok: true };
}

export function briefingQuotaErrorMessage(
  check: Exclude<BriefingQuotaCheck, { ok: true }>,
): string {
  return `You've reached the limit of ${check.limit} briefings. Archive or delete an existing briefing, or self-host with VITE_SELF_HOSTED=1.`;
}
