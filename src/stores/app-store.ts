import { create } from "zustand";
import { open, deleteDatabase } from "../core/storage/db.ts";
import { DEFAULT_PASSPHRASE, LOCAL_STORAGE } from "../utils/constants.ts";
import { useSyncStore } from "./sync-store.ts";

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  initialize: (passphrase: string) => Promise<void>;
  /** Initialize DB for returning users. Reads localStorage to determine local-only vs sync mode. */
  initializeReturningUser: () => Promise<void>;
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

  initializeReturningUser: async () => {
    const storageMode = localStorage.getItem(LOCAL_STORAGE.STORAGE_MODE);
    const storedPassphrase = localStorage.getItem(
      LOCAL_STORAGE.SYNC_PASSPHRASE,
    );
    const isSyncUser = storageMode === "sync" && storedPassphrase;

    const passphrase = storedPassphrase ?? DEFAULT_PASSPHRASE;

    if (isSyncUser) {
      useSyncStore.setState({ passphrase: storedPassphrase });
    }

    const result = await open(passphrase);
    if (result.ok) {
      set({ isDbReady: true, error: null });
    } else {
      set({ isDbReady: false, error: result.error });
      return;
    }

    if (isSyncUser) {
      await useSyncStore.getState().pull();
      if (useSyncStore.getState().status !== "error") {
        useSyncStore.setState({ status: "synced", lastSyncedAt: Date.now() });
      }
    }
  },

  setError: (error) => set({ error }),

  completeOnboarding: () => {
    localStorage.setItem(LOCAL_STORAGE.ONBOARDING_COMPLETE, "true");
    set({ hasCompletedOnboarding: true });
  },

  checkOnboardingStatus: () => {
    const completed =
      localStorage.getItem(LOCAL_STORAGE.ONBOARDING_COMPLETE) === "true";
    set({ hasCompletedOnboarding: completed });
  },

  resetApp: async () => {
    await deleteDatabase();
    localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
    set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
  },
}));
