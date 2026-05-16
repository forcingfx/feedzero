/**
 * React-side consumer of `gateState` from src/core/features/feature-gates.
 *
 * Components call `useFeatureGate("auto-organize")` and get back an
 * enriched GateState with a `promptUpgrade()` action that routes to the
 * Personal-monthly checkout deeplink. Tier comes from `useLicenseStore`
 * so all gated components stay in sync.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useLicenseStore } from "@/stores/license-store";
import {
  gateState,
  type Feature,
  type GateState,
} from "@/core/features/feature-gates";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";

export interface UseFeatureGate extends GateState {
  /** Navigate to the Personal-monthly subscribe deeplink. */
  promptUpgrade: () => void;
}

export function useFeatureGate(feature: Feature): UseFeatureGate {
  const tier = useLicenseStore((s) => s.tier);
  const state = gateState(feature, tier, isSelfHosted(), isPaidTierActive());
  const navigate = useNavigate();
  const promptUpgrade = useCallback(() => {
    navigate("/?subscribe=personal-monthly");
  }, [navigate]);
  return { ...state, promptUpgrade };
}
