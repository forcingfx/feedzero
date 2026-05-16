/**
 * Feature-gate capability map + pure gateState() function.
 *
 * One source of truth for "which tier unlocks which feature, and is it
 * actually shipped yet". Pure module — no React, no I/O — so the matrix
 * is exhaustively testable and consumable from both the React hook and
 * defensive store-level guards.
 *
 * Three gate dimensions:
 *  1. `requiredTier`  — minimum tier that unlocks the feature.
 *  2. `status`        — "shipped" or "coming-soon". Coming-soon features
 *                       return `not-built` regardless of tier or self-hosted
 *                       (the code isn't there to enable).
 *  3. `isSelfHosted`  — when true, bypass tier checks for shipped features.
 *                       Honor-system bypass; see ADR 012.
 *
 * Reason codes are returned alongside `enabled` so callers can render
 * accurate UI ("Upgrade to Personal" vs "Coming soon" vs the live feature).
 */

import type { LicenseTier } from "../license/format";

export type Tier = LicenseTier;

export type Feature =
  | "cloud-sync"
  | "auto-organize"
  | "filters"
  | "mute-keywords"
  | "search"
  | "ai-signal"
  | "authenticated-fetchers"
  | "send-to-kindle"
  | "bridges"
  | "themes-commercial";

export type FeatureStatus = "shipped" | "coming-soon";

export interface FeatureSpec {
  requiredTier: Tier;
  status: FeatureStatus;
}

export const FEATURE_MAP: Record<Feature, FeatureSpec> = {
  "cloud-sync":             { requiredTier: "personal", status: "shipped" },
  "auto-organize":          { requiredTier: "personal", status: "shipped" },
  "filters":                { requiredTier: "personal", status: "coming-soon" },
  "mute-keywords":          { requiredTier: "personal", status: "coming-soon" },
  "search":                 { requiredTier: "pro",      status: "coming-soon" },
  "ai-signal":              { requiredTier: "pro",      status: "coming-soon" },
  "authenticated-fetchers": { requiredTier: "pro",      status: "coming-soon" },
  "send-to-kindle":         { requiredTier: "pro",      status: "coming-soon" },
  "bridges":                { requiredTier: "pro",      status: "coming-soon" },
  "themes-commercial":      { requiredTier: "pro",      status: "coming-soon" },
};

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

const TIER_ORDER: Record<Tier, number> = { free: 0, personal: 1, pro: 2 };

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
  if (TIER_ORDER[currentTier] >= TIER_ORDER[spec.requiredTier]) {
    return { enabled: true, reason: "ok", requiredTier: spec.requiredTier };
  }
  return { enabled: false, reason: "tier-locked", requiredTier: spec.requiredTier };
}
