/**
 * Login wizard state — controls visibility of <DeviceSetupWizard>.
 *
 * Tiny one-flag store. Lives separately from useSettingsStore because the
 * login wizard can open in contexts where Settings is not appropriate
 * (e.g. from the AccountUpgradeSection's secondary "Already have an
 * account?" link, while Settings is already showing the upgrade view).
 */
import { create } from "zustand";

interface LoginStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useLoginStore = create<LoginStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
