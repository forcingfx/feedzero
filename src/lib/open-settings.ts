/**
 * Single entry point for opening the unified Settings dialog.
 *
 * Default tab is "account" because that's where tier, billing, sync, and
 * upgrade live — the dominant reason to open settings. Pass a tab name to
 * land elsewhere ("data" for import/export, "help" for shortcuts/feedback).
 *
 * Replaces requestSyncSetup() and direct useSyncStore.setDialogOpen calls.
 * Callers shouldn't reach into the store themselves — going through this
 * helper means future routing (e.g., "free user opens settings → highlight
 * upgrade section") has one place to live.
 */
import {
  useSettingsStore,
  type SettingsTab,
} from "@/stores/settings-store";

export function openSettings(tab?: SettingsTab): void {
  const next: SettingsTab = tab ?? "account";
  useSettingsStore.setState({ open: true, activeTab: next });
}

export function closeSettings(): void {
  useSettingsStore.setState({ open: false });
}
