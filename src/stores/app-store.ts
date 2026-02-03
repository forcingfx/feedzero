import { create } from "zustand";
import { open, deleteDatabase } from "../core/storage/db.ts";

const ONBOARDING_KEY = "feedzero:onboarding-complete";

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  initialize: (passphrase: string) => Promise<void>;
  setError: (error: string | null) => void;
  completeOnboarding: () => void;
  checkOnboardingStatus: () => void;
  resetApp: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  isDbReady: false,
  error: null,
  hasCompletedOnboarding: null,

  initialize: async (passphrase) => {
    const result = await open(passphrase);
    if (result.ok) {
      set({ isDbReady: true, error: null });
    } else {
      set({ isDbReady: false, error: result.error });
    }
  },

  setError: (error) => set({ error }),

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    set({ hasCompletedOnboarding: true });
  },

  checkOnboardingStatus: () => {
    const completed = localStorage.getItem(ONBOARDING_KEY) === "true";
    set({ hasCompletedOnboarding: completed });
  },

  resetApp: async () => {
    await deleteDatabase();
    localStorage.removeItem(ONBOARDING_KEY);
    set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
  },
}));
