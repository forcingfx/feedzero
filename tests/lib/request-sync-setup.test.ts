/**
 * requestSyncSetup() — now a thin alias for openSettings("account").
 *
 * Phase A established the unified Settings dialog with an Account tab.
 * Phase B extended the Account tab to render the right content per tier
 * (upgrade section for free users, sync controls for paid). So the gate
 * logic that used to live in requestSyncSetup is now in the tab itself —
 * one path, one place. requestSyncSetup remains as a named entry point
 * for callers that want the "user clicked something sync-adjacent" intent
 * documented at the call site, but it just opens Settings → Account.
 *
 * Kept as a separate helper (vs inlining openSettings calls) so future
 * changes (e.g. "highlight the sync section when triggered from a sync
 * affordance") have one place to live.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { requestSyncSetup } from "@/lib/request-sync-setup";
import { useSettingsStore } from "@/stores/settings-store";
import { useLicenseStore } from "@/stores/license-store";

describe("requestSyncSetup", () => {
  beforeEach(() => {
    useSettingsStore.setState({ open: false, activeTab: "account" });
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("opens Settings on the Account tab for free users (where the upgrade section lives)", () => {
    requestSyncSetup();
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
  });

  it("opens Settings on the Account tab for paid users (where the sync section lives)", () => {
    useLicenseStore.setState({ tier: "personal" });
    requestSyncSetup();
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
  });
});
