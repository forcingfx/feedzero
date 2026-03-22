import { create } from "zustand";
import {
  pushVault,
  pullVault,
  importVault,
  deleteVault,
  exportVault,
  mergeVaults,
} from "../core/sync/sync-service";
import type { SyncCredentials } from "../core/sync/sync-service";
import { deriveVaultId, deriveVaultKey } from "../core/sync/vault-crypto.ts";
import { deleteDatabase, getSalt } from "../core/storage/db.ts";
import { LOCAL_STORAGE } from "../utils/constants.ts";
import {
  deriveAndStoreKeys,
  clearStoredKeys,
} from "../core/storage/key-material.ts";
import type { Result } from "../utils/result.ts";
import { ok, err } from "../utils/result.ts";

export type SyncStatus = "local-only" | "syncing" | "synced" | "error";

const DEBOUNCE_MS = 5000;
const MAX_JITTER_MS = 30000;

type SwitchMode = "replace" | "merge";

interface SyncStore {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  credentials: SyncCredentials | null;
  dialogOpen: boolean;

  /** Enable sync: derive keys, push vault, transition to synced. */
  enableSync: (passphrase: string) => Promise<void>;
  /** Restore sync state from pre-derived credentials without pushing. */
  restoreSync: (credentials: SyncCredentials) => void;
  /** Disable sync: delete server vault, reset state, clear persisted data. */
  disableSync: () => Promise<void>;
  /** Log out: clear local data and reset to onboarding. Cloud vault is preserved. */
  logout: () => Promise<void>;
  /** Push local data to the server. */
  push: () => Promise<void>;
  /** Pull data from the server and import into local DB. */
  pull: () => Promise<void>;
  /** Schedule a debounced push (5s after last call). */
  scheduleSyncPush: () => void;
  setDialogOpen: (open: boolean) => void;
  /**
   * Switch from local-only to an existing cloud account.
   * - replace: Delete local data, import cloud data.
   * - merge: Merge local and cloud data, push merged result.
   */
  switchToExistingCloud: (
    passphrase: string,
    mode: SwitchMode,
  ) => Promise<Result<boolean>>;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let jitterTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimers(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (jitterTimer) {
    clearTimeout(jitterTimer);
    jitterTimer = null;
  }
}

async function deriveSyncCredentials(
  passphrase: string,
): Promise<Result<SyncCredentials>> {
  const [vaultIdResult, vaultKeyResult] = await Promise.all([
    deriveVaultId(passphrase),
    deriveVaultKey(passphrase),
  ]);
  if (!vaultIdResult.ok) return vaultIdResult;
  if (!vaultKeyResult.ok) return vaultKeyResult;
  return ok({ vaultId: vaultIdResult.value, vaultKey: vaultKeyResult.value });
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: "local-only",
  lastSyncedAt: null,
  error: null,
  credentials: null,
  dialogOpen: false,

  enableSync: async (passphrase) => {
    const credsResult = await deriveSyncCredentials(passphrase);
    if (!credsResult.ok) {
      set({ status: "error", error: credsResult.error });
      return;
    }
    const credentials = credsResult.value;

    set({ credentials, status: "syncing", error: null });
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");

    // Persist the current in-memory DB keys (which can decrypt local data)
    // alongside the new vault keys derived from the sync passphrase.
    // We must NOT re-derive DB keys from the new passphrase — local data
    // is encrypted with the original onboarding passphrase's keys.
    const { exportCurrentKeys } = await import("../core/storage/db.ts");
    const currentKeys = await exportCurrentKeys();
    if (currentKeys.ok) {
      const saltResult = await getSalt();
      const dbSalt = saltResult.ok ? Array.from(saltResult.value) : [];
      const vaultIdResult = await deriveVaultId(passphrase);
      const vaultKeyResult = await deriveVaultKey(passphrase, {
        extractable: true,
      });
      if (vaultIdResult.ok && vaultKeyResult.ok) {
        const { exportCryptoKey } = await import("../core/storage/crypto.ts");
        const vaultKeyJwk = await exportCryptoKey(vaultKeyResult.value);
        const material = {
          dbKeyJwk: currentKeys.value.dbKeyJwk,
          hmacKeyJwk: currentKeys.value.hmacKeyJwk,
          dbSalt,
          vaultId: vaultIdResult.value,
          vaultKeyJwk,
        };
        localStorage.setItem(
          LOCAL_STORAGE.DERIVED_KEYS,
          JSON.stringify(material),
        );
      }
    }

    const result = await pushVault(credentials);
    if (result.ok) {
      set({ status: "synced", lastSyncedAt: result.value, error: null });
    } else {
      set({ status: "error", error: result.error });
    }
  },

  restoreSync: (credentials) => {
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");
    set({
      credentials,
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
    });
  },

  disableSync: async () => {
    clearPendingTimers();
    const { credentials } = get();
    if (credentials) {
      await deleteVault(credentials);
    }

    // Re-persist current DB keys without vault keys so local data
    // remains accessible in future sessions after switching to local-only.
    const { exportCurrentKeys } = await import("../core/storage/db.ts");
    const currentKeys = await exportCurrentKeys();
    if (currentKeys.ok) {
      const saltResult = await getSalt();
      const dbSalt = saltResult.ok ? Array.from(saltResult.value) : [];
      const material = {
        dbKeyJwk: currentKeys.value.dbKeyJwk,
        hmacKeyJwk: currentKeys.value.hmacKeyJwk,
        dbSalt,
      };
      localStorage.setItem(
        LOCAL_STORAGE.DERIVED_KEYS,
        JSON.stringify(material),
      );
    }

    localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
    set({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
  },

  logout: async () => {
    clearPendingTimers();
    await deleteDatabase();
    clearStoredKeys();
    localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
    localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
    set({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
    const { resetAllStores } = await import("./app-store.ts");
    await resetAllStores();
  },

  push: async () => {
    const { credentials } = get();
    if (!credentials) return;

    const result = await pushVault(credentials);
    if (result.ok) {
      set({ status: "synced", lastSyncedAt: result.value, error: null });
    } else {
      set({ status: "error", error: result.error });
    }
  },

  pull: async () => {
    const { credentials } = get();
    if (!credentials) return;

    set({ status: "syncing", error: null });
    const pullResult = await pullVault(credentials);
    if (!pullResult.ok) {
      set({ status: "error", error: pullResult.error });
      return;
    }

    const importResult = await importVault(pullResult.value);
    if (!importResult.ok) {
      set({ status: "error", error: importResult.error });
      return;
    }

    set({ status: "synced", lastSyncedAt: Date.now(), error: null });
  },

  scheduleSyncPush: () => {
    const { credentials } = get();
    if (!credentials) return;

    clearPendingTimers();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
      jitterTimer = setTimeout(() => {
        jitterTimer = null;
        get().push();
      }, jitter);
    }, DEBOUNCE_MS);
  },

  setDialogOpen: (open) => set({ dialogOpen: open }),

  switchToExistingCloud: async (passphrase, mode) => {
    set({ status: "syncing", error: null });

    const credsResult = await deriveSyncCredentials(passphrase);
    if (!credsResult.ok) {
      set({ status: "error", error: credsResult.error });
      return err(credsResult.error);
    }
    const credentials = credsResult.value;

    if (mode === "replace") {
      const pullResult = await pullVault(credentials);
      if (!pullResult.ok) {
        set({ status: "error", error: pullResult.error });
        return pullResult;
      }

      const importResult = await importVault(pullResult.value);
      if (!importResult.ok) {
        set({ status: "error", error: importResult.error });
        return importResult;
      }

      // Store derived keys, remove raw passphrase
      const saltResult = await getSalt();
      const salt = saltResult.ok ? saltResult.value : undefined;
      await deriveAndStoreKeys(passphrase, salt, {
        includeVaultKeys: true,
      });
      localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");
      set({
        credentials,
        status: "synced",
        lastSyncedAt: Date.now(),
        error: null,
      });
      return ok(true);
    }

    // Merge mode: export local, pull cloud, merge, import, push
    const exportResult = await exportVault();
    if (!exportResult.ok) {
      set({ status: "error", error: exportResult.error });
      return exportResult;
    }

    const pullResult = await pullVault(credentials);
    if (!pullResult.ok) {
      set({ status: "error", error: pullResult.error });
      return pullResult;
    }

    const mergeResult = mergeVaults(exportResult.value, pullResult.value);
    if (!mergeResult.ok) {
      set({ status: "error", error: mergeResult.error });
      return mergeResult;
    }

    const importResult = await importVault(mergeResult.value);
    if (!importResult.ok) {
      set({ status: "error", error: importResult.error });
      return importResult;
    }

    const pushResult = await pushVault(credentials);
    if (!pushResult.ok) {
      set({ status: "error", error: pushResult.error });
      return err(pushResult.error);
    }

    // Store derived keys, remove raw passphrase
    const saltResult = await getSalt();
    const salt = saltResult.ok ? saltResult.value : undefined;
    await deriveAndStoreKeys(passphrase, salt, {
      includeVaultKeys: true,
    });
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");
    set({
      credentials,
      status: "synced",
      lastSyncedAt: pushResult.value,
      error: null,
    });
    return ok(true);
  },
}));
