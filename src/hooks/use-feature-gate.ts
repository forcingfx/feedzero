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
  type Feature,
  type GateState,
} from "@/core/features/feature-gates";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";
import { goToUpgrade } from "@/lib/go-to-settings";

export interface UseFeatureGate extends GateState {
  /** Navigate to the Settings page's upgrade affordance. */
  promptUpgrade: () => void;
}

export function useFeatureGate(feature: Feature): UseFeatureGate {
  const tier = useLicenseStore((s) => s.tier);
  const navigate = useNavigate();
  const state = gateState(feature, tier, isSelfHosted(), isPaidTierActive());
  return { ...state, promptUpgrade: () => goToUpgrade(navigate) };
}
