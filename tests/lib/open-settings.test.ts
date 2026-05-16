/**
 * openSettings — single helper for opening the unified Settings dialog.
 *
 * Replaces three previous entry points:
 *   - useSyncStore.setDialogOpen(true)
 *   - useLicenseStore.openUpgradeDialog()
 *   - requestSyncSetup() (the gate-routing helper)
 *
 * Every caller now opens the same dialog. The optional `tab` arg picks which
 * tab to land on. Default is "account" because that's where the upgrade,
 * sync, and billing surfaces live — the most common reason to open settings.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openSettings, closeSettings } from "@/lib/open-settings";
import { useSettingsStore } from "@/stores/settings-store";

describe("openSettings", () => {
  beforeEach(() => {
    useSettingsStore.setState({ open: false, activeTab: "account" });
  });

  it("opens the dialog on the Account tab by default", () => {
    openSettings();
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
  });

  it("opens on the requested tab when one is provided", () => {
    openSettings("data");
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("data");
  });

  it("switches tab when called with a new tab while already open", () => {
    openSettings("reading");
    openSettings("help");
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("help");
  });

  it("closeSettings closes the dialog but preserves the last active tab", () => {
    openSettings("help");
    closeSettings();
    const s = useSettingsStore.getState();
    expect(s.open).toBe(false);
    expect(s.activeTab).toBe("help");
  });
});
