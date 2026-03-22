import { create } from "zustand";
import {
  open,
  openWithKeys,
  deleteDatabase,
  getFeeds,
} from "../core/storage/db.ts";
import { LOCAL_STORAGE, CRYPTO } from "../utils/constants.ts";
import { importCryptoKey } from "../core/storage/crypto.ts";
import {
  loadStoredKeys,
  clearStoredKeys,
} from "../core/storage/key-material.ts";
import { useSyncStore } from "./sync-store.ts";

interface AppStore {
  isDbReady: boolean;
  error: string | null;
  hasCompletedOnboarding: boolean | null;
  initialize: (passphrase: string) => Promise<void>;
  /** Initialize DB for returning users using stored derived keys. */
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
    // Delete any existing DB first to ensure a clean start for new users.
    // This prevents stale encrypted data from a previous session leaking
    // into a fresh onboarding flow.
    await deleteDatabase();
    const result = await open(passphrase);
    if (result.ok) {
      set({ isDbReady: true, error: null });
    } else {
      set({ isDbReady: false, error: result.error });
    }
  },

  initializeReturningUser: async () => {
    const storageMode = localStorage.getItem(LOCAL_STORAGE.STORAGE_MODE);
    const storedKeys = loadStoredKeys();
    const isSyncUser = storageMode === "sync";

    if (!storedKeys) {
      set({
        isDbReady: false,
        error:
          "No stored keys found. Please reset the app and set up again.",
      });
      return;
    }

    const result = await openWithKeys(
      storedKeys.dbKeyJwk,
      storedKeys.hmacKeyJwk,
    );

    if (isSyncUser && storedKeys.vaultId && storedKeys.vaultKeyJwk) {
      const vaultKey = await importCryptoKey(storedKeys.vaultKeyJwk, {
        name: CRYPTO.ALGORITHM,
        length: CRYPTO.KEY_LENGTH,
      });
      useSyncStore.setState({
        credentials: { vaultId: storedKeys.vaultId, vaultKey },
      });
    }

    if (!result.ok) {
      set({ isDbReady: false, error: result.error });
      return;
    }

    const feedsResult = await getFeeds();
    if (!feedsResult.ok) {
      set({ isDbReady: false, error: feedsResult.error });
      return;
    }

    set({ isDbReady: true, error: null });

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
    clearStoredKeys();
    localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
    localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
    set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
    await resetAllStores();
  },
}));

/**
 * Reset all stores to initial state. Called by sync-store.logout()
 * to avoid cross-store knowledge in individual stores.
 */
export async function resetAllStores(): Promise<void> {
  const { useFeedStore } = await import("./feed-store.ts");
  const { useArticleStore } = await import("./article-store.ts");
  const { useOnboardingStore } = await import("./onboarding-store.ts");
  useAppStore.setState({ isDbReady: false, hasCompletedOnboarding: false });
  useFeedStore.setState({ feeds: [], selectedFeedId: null });
  useArticleStore.setState({ articles: [], selectedArticle: null });
  useOnboardingStore.getState().reset();
}
