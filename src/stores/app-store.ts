import { create } from "zustand";
import {
  open,
  openWithKeys,
  deleteDatabase,
  getFeeds,
} from "../core/storage/db.ts";
import {
  DEFAULT_PASSPHRASE,
  LOCAL_STORAGE,
  CRYPTO,
} from "../utils/constants.ts";
import { importCryptoKey } from "../core/storage/crypto.ts";
import { loadStoredKeys } from "../core/storage/key-material.ts";
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
    const storedKeys = loadStoredKeys();
    const isSyncUser = storageMode === "sync";

    let result;

    if (storedKeys) {
      // Use pre-derived keys (no raw passphrase needed)
      result = await openWithKeys(storedKeys.dbKeyJwk, storedKeys.hmacKeyJwk);

      if (isSyncUser && storedKeys.vaultId && storedKeys.vaultKeyJwk) {
        const vaultKey = await importCryptoKey(storedKeys.vaultKeyJwk, {
          name: CRYPTO.ALGORITHM,
          length: CRYPTO.KEY_LENGTH,
        });
        useSyncStore.setState({
          credentials: { vaultId: storedKeys.vaultId, vaultKey },
        });
      }
    } else {
      // Legacy fallback: read passphrase from localStorage
      const storedPassphrase = localStorage.getItem(
        LOCAL_STORAGE.SYNC_PASSPHRASE,
      );
      const passphrase = storedPassphrase ?? DEFAULT_PASSPHRASE;
      result = await open(passphrase);

      if (isSyncUser && storedPassphrase) {
        // Migrate: derive and store keys, remove raw passphrase
        const { deriveAndStoreKeys } =
          await import("../core/storage/key-material.ts");
        const migrateResult = await deriveAndStoreKeys(
          storedPassphrase,
          undefined,
          { includeVaultKeys: true },
        );
        if (migrateResult.ok) {
          localStorage.removeItem(LOCAL_STORAGE.SYNC_PASSPHRASE);

          const keys = migrateResult.value;
          if (keys.vaultId && keys.vaultKeyJwk) {
            const vaultKey = await importCryptoKey(keys.vaultKeyJwk, {
              name: CRYPTO.ALGORITHM,
              length: CRYPTO.KEY_LENGTH,
            });
            useSyncStore.setState({
              credentials: { vaultId: keys.vaultId, vaultKey },
            });
          }
        }
      }
    }

    if (!result.ok) {
      set({ isDbReady: false, error: result.error });
      return;
    }

    // Validate that decryption works by attempting to read feeds
    const feedsResult = await getFeeds();
    if (!feedsResult.ok) {
      set({
        isDbReady: false,
        error: feedsResult.error,
      });
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
    localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
    set({ isDbReady: false, error: null, hasCompletedOnboarding: false });
  },
}));
