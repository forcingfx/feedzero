/**
 * Feature-gate capability map + pure gateState() function.
 *
 * Binary capability gating ("does this tier have this feature at all").
 * The canonical data lives in `tier-matrix.ts`; this module projects
 * the matrix into the legacy `{ requiredTier, status }` shape consumed
 * by `useFeatureGate`, store-level guards, and tests.
 *
 * Three gate dimensions:
 *  1. `requiredTier`  — minimum tier that unlocks the feature
 *                       (lowest available tier in the matrix entry).
 *  2. `status`        — "shipped" or "coming-soon". Coming-soon features
 *                       return `not-built` regardless of tier or self-hosted
 *                       (the code isn't there to enable).
 *  3. `isSelfHosted`  — when true, bypass tier checks for shipped features.
 *                       Honor-system bypass; see ADR 012.
 *
 * Reason codes are returned alongside `enabled` so callers can render
 * accurate UI ("Upgrade to Personal" vs "Coming soon" vs the live feature).
 *
 * Continuous limits (e.g. the 50-feed cap on Free) live in `quotas.ts`,
 * also derived from the same matrix.
 */

import type { LicenseTier } from "../license/format";
import {
  GATED_FEATURE_IDS,
  TIER_MATRIX,
  getRequiredTier,
  featureName,
  requiredTierLabel,
  gateDescription,
  gateToast,
  tierLabel,
  type FeatureId,
} from "./tier-matrix";

// Re-export the matrix-derived messaging helpers so gating consumers have
// a single import surface for both the decision (`gateState`) and the copy.
export {
  featureName,
  requiredTierLabel,
  gateDescription,
  gateToast,
  tierLabel,
};

export type Tier = LicenseTier;

export type Feature = (typeof GATED_FEATURE_IDS)[number];

export type FeatureStatus = "shipped" | "coming-soon";

export interface FeatureSpec {
  requiredTier: Tier;
  status: FeatureStatus;
}

/**
 * Legacy projection of the tier matrix down to `{ requiredTier, status }`
 * for every gated feature. Kept for back-compat with the components,
 * stores, and tests that already iterate over it. New code should
 * prefer `tier-matrix.ts` directly.
 */
export const FEATURE_MAP: Record<Feature, FeatureSpec> = Object.fromEntries(
  GATED_FEATURE_IDS.map((id) => [
    id,
    { requiredTier: getRequiredTier(id), status: TIER_MATRIX[id].status },
  ]),
) as Record<Feature, FeatureSpec>;

export type GateReason =
  | "ok"
  | "self-hosted-bypass"
  /**
   * The paid tier is dormant in this build (VITE_PAID_TIER_VISIBLE !== "1").
   * No Subscribe path exists, so the gate relaxes for shipped features —
   * everyone gets full functionality until the paid tier is launched.
   * Distinct from `self-hosted-bypass` so telemetry/UI can distinguish
   * "operator running their own server" from "vendor hasn't launched
   * paid yet".
   */
  | "paid-tier-inactive"
  | "tier-locked"
  | "not-built";

export interface GateState {
  enabled: boolean;
  reason: GateReason;
  requiredTier: Tier;
}

const TIER_RANK: Record<Tier, number> = { free: 0, personal: 1, pro: 2 };

/**
 * Evaluate the gate for a feature given the current user's tier, the
 * self-hosted flag, and whether the paid tier has been launched.
 * Pure — same inputs always yield the same output.
 *
 * Precedence:
 *   `not-built` (status)
 *   > `paid-tier-inactive` (entire monetization layer dormant)
 *   > `self-hosted-bypass`
 *   > tier check.
 *
 * `not-built` wins because flipping any flag should not pretend a
 * feature exists when its code hasn't shipped. `paid-tier-inactive`
 * outranks self-hosted because it's a build-wide signal that there
 * is no upgrade path at all, so the gate is meaningless.
 */
export function gateState(
  feature: Feature,
  currentTier: Tier,
  isSelfHosted: boolean,
  paidTierActive: boolean,
): GateState {
  const spec = FEATURE_MAP[feature];
  if (spec.status === "coming-soon") {
    return { enabled: false, reason: "not-built", requiredTier: spec.requiredTier };
  }
  if (!paidTierActive) {
    return { enabled: true, reason: "paid-tier-inactive", requiredTier: spec.requiredTier };
  }
  if (isSelfHosted) {
    return { enabled: true, reason: "self-hosted-bypass", requiredTier: spec.requiredTier };
  }
  if (TIER_RANK[currentTier] >= TIER_RANK[spec.requiredTier]) {
    return { enabled: true, reason: "ok", requiredTier: spec.requiredTier };
  }
  return { enabled: false, reason: "tier-locked", requiredTier: spec.requiredTier };
}

export type { FeatureId };
