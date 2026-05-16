/**
 * Intent-layer gate for the "Enable cloud sync" affordance.
 *
 * Cloud sync is a paid feature. Free users in production paywall mode used
 * to be able to click the affordance, derive a passphrase, push a vault, and
 * only THEN hit a 401 from /api/sync — landing in SyncMigrationDialog with
 * no obvious way back. This helper checks the gate first: free users hit
 * the UpgradeDialog instead of starting a flow they can't complete.
 *
 * Single chokepoint so all three call sites (sidebar's LocalStorageWarning,
 * SyncStatusChip, settings menu) share the same gating logic. To add a new
 * "Enable cloud sync" entry point, call this — never call
 * `useSyncStore.getState().setDialogOpen(true)` directly.
 */

import { useLicenseStore } from "@/stores/license-store";
import { useSyncStore } from "@/stores/sync-store";
import { gateState } from "@/core/features/feature-gates";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";

export function requestSyncSetup(): void {
  const tier = useLicenseStore.getState().tier;
  const gate = gateState(
    "cloud-sync",
    tier,
    isSelfHosted(),
    isPaidTierActive(),
  );
  if (gate.enabled) {
    useSyncStore.getState().setDialogOpen(true);
    return;
  }
  // gate.reason === "tier-locked" (or "not-built", which can't happen
  // because cloud-sync is shipped, but we route to upgrade either way).
  useLicenseStore.getState().openUpgradeDialog();
}
