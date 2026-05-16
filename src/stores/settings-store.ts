/**
 * Unified Settings dialog state.
 *
 * Single source of truth for the in-app Settings dialog's open/closed state
 * and which tab is active. Replaces three previous mechanisms:
 *   - useSyncStore.dialogOpen (cloud-sync setup modal)
 *   - useLicenseStore.upgradeDialogOpen (upgrade tier-comparison modal)
 *   - local useState in SettingsMenu (keyboard shortcuts, feedback,
 *     auto-organize subdialogs)
 *
 * All of those collapse into THIS store + the four-tab Settings dialog.
 * Use `openSettings(tab?)` and `closeSettings()` from `@/lib/open-settings`
 * — components should rarely call setState on this store directly.
 */
import { create } from "zustand";

// Unified Settings dialog tabs. Account is default — it's the central hub
// for tier / billing / sync / upgrade. Reading + Help fold what used to
// live in the sidebar dropdown menu (Group floods toggle, Auto-organize
// launcher, Keyboard shortcuts, Send feedback, What's new). Import and
// Export are the data-portability flows.
export type SettingsTab =
  | "account"
  | "reading"
  | "help"
  | "import"
  | "export";

interface SettingsState {
  open: boolean;
  activeTab: SettingsTab;
  setOpen: (open: boolean) => void;
  setActiveTab: (tab: SettingsTab) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  activeTab: "account",
  setOpen: (open) => set({ open }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
