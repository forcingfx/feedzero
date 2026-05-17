/**
 * Login wizard state — controls visibility of <DeviceSetupWizard>.
 *
 * Tiny one-flag store. Independent of the Settings page so the login
 * wizard can open in contexts where Settings isn't appropriate (e.g.
 * from SubscriptionUpgrade's secondary "Already have an account?"
 * link while the upgrade view is already on screen).
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
