import { toast } from "sonner";
import {
  gateState,
  gateToast,
  type Feature,
} from "../core/features/feature-gates.ts";
import { isSelfHosted } from "../core/features/self-hosted.ts";
import { isPaidTierActive } from "../core/features/paid-tier-active.ts";
import { useLicenseStore } from "./license-store.ts";

/**
 * Store-side feature gating, derived entirely from the tier matrix.
 *
 * Every store mutator that exposes a gated capability runs through these
 * two helpers so the decision (`gateState`) and the message (`gateToast`)
 * come from one place. Editing the matrix — renaming a feature or moving
 * it between tiers — flows through to every toast with no string edits.
 *
 * The UI layer mirrors this via `useFeatureGate`; both consult the same
 * `gateState` so the page affordance and the store guard can never drift.
 */

/** True when the current session may use the feature (tier / self-host / pre-launch). */
export function isFeatureEnabled(feature: Feature): boolean {
  return gateState(
    feature,
    useLicenseStore.getState().tier,
    isSelfHosted(),
    isPaidTierActive(),
  ).enabled;
}

/**
 * Guard a store mutator. Returns true when the feature is available.
 * When locked, fires the matrix-derived upgrade toast (unless `silent`)
 * and returns false so the caller can abort.
 *
 * Use `silent: true` for secondary/internal mutators whose entry point
 * is already gated in the UI (the user can't reach them while locked),
 * keeping the guard as defense-in-depth without a redundant toast.
 */
export function enforceFeature(
  feature: Feature,
  opts?: { silent?: boolean },
): boolean {
  if (isFeatureEnabled(feature)) return true;
  if (!opts?.silent) toast(gateToast(feature));
  return false;
}
