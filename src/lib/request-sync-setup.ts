/**
 * "User intent: open the sync surface" — now a thin alias for
 * `openSettings("account")`.
 *
 * Phase A established the unified Settings dialog with an Account tab.
 * Phase B extended that tab to adaptively render the upgrade comparison
 * for free users and the cloud-sync controls for paid users. So the gate
 * routing that used to live here (free → UpgradeDialog, paid →
 * SyncSetupDialog) is now expressed by the Account tab itself.
 *
 * Kept as a named function (vs inlining `openSettings("account")` at each
 * call site) so callers preserve the "this click is sync-adjacent" intent
 * at their site — useful if we later want to scroll to / highlight the
 * sync section when the dialog opens from a sync affordance.
 */
import { openSettings } from "@/lib/open-settings";

export function requestSyncSetup(): void {
  openSettings("account");
}
