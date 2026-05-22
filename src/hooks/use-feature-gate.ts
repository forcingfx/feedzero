/**
 * React-side consumer of `gateState` from src/core/features/feature-gates.
 *
 * Components call `useFeatureGate("auto-organize")` and get back an
 * enriched GateState with a `promptUpgrade()` action that navigates to
 * the Settings page on the upgrade-affordance tab. Tier comes from
 * `useLicenseStore` so all gated components stay in sync.
 */

import { useNavigate } from "react-router";
import { useLicenseStore } from "@/stores/license-store";
import {
  gateState,
  featureName,
  requiredTierLabel,
  gateDescription,
  type Feature,
  type GateState,
} from "@/core/features/feature-gates";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";
import { goToUpgrade } from "@/lib/go-to-settings";

export interface UseFeatureGate extends GateState {
  /** Navigate to the Settings page's upgrade affordance. */
  promptUpgrade: () => void;
  /** Matrix display name, e.g. "Smart filters". */
  featureName: string;
  /** Capitalized lowest tier that unlocks the feature, e.g. "Personal". */
  requiredTierLabel: string;
  /** Matrix description, reused across upgrade surfaces. */
  description: string;
}

export function useFeatureGate(feature: Feature): UseFeatureGate {
  const tier = useLicenseStore((s) => s.tier);
  const navigate = useNavigate();
  const state = gateState(feature, tier, isSelfHosted(), isPaidTierActive());
  return {
    ...state,
    promptUpgrade: () => goToUpgrade(navigate),
    featureName: featureName(feature),
    requiredTierLabel: requiredTierLabel(feature),
    description: gateDescription(feature),
  };
}
