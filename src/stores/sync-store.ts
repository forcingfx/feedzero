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
import {
  addVaultKeys,
  removeVaultKeys,
  destroyLocal,
  rekeyFromPassphrase,
} from "../core/storage/key-manager.ts";
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

  enableSync: (passphrase: string) => Promise<void>;
  restoreSync: (credentials: SyncCredentials) => void;
  disableSync: () => Promise<void>;
  logout: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  scheduleSyncPush: () => void;
  setDialogOpen: (open: boolean) => void;
  switchToExistingCloud: (
    passphrase: string,
    mode: SwitchMode,
  ) => Promise<Result<boolean>>;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let jitterTimer: ReturnType<typeof setTimeout> | null = null;

// Concurrent pull() callers share a single in-flight pull. Without this,
// AppInit's initializeReturningUser pull and the auto-fired refreshAll
// pull run back-to-back: the second one's importAll clears the tables
// and races readers. See tests/e2e/sync-100-feeds.spec.ts for the
// reproducer.
let inFlightPull: Promise<void> | null = null;

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
    // Derive vault keys and persist alongside existing DB keys
    const keysResult = await addVaultKeys(passphrase);
    if (!keysResult.ok) {
      set({ status: "error", error: keysResult.error });
      return;
    }
    const credentials = keysResult.value;

    set({ credentials, status: "syncing", error: null });

    // Push local data to vault — if this fails, keys are already stored
    // (next session will have sync mode set, and can retry push)
    const result = await pushVault(credentials);
    if (result.ok) {
      set({ status: "synced", lastSyncedAt: result.value, error: null });
    } else {
      set({ status: "error", error: result.error });
    }
  },

  restoreSync: (credentials) => {
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
      const deleteResult = await deleteVault(credentials);
      if (!deleteResult.ok) {
        const retry = await deleteVault(credentials);
        if (!retry.ok) {
          set({
            status: "error",
            error: `Could not delete server data: ${retry.error}. Your cloud vault may still exist. Try again.`,
          });
          return;
        }
      }
    }

    // Vault confirmed deleted — strip vault keys, keep DB keys
    removeVaultKeys();
    set({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
  },

  logout: async () => {
    clearPendingTimers();
    // Preserve cloud vault (intentional — for recovery on another device)
    await destroyLocal();
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
    if (inFlightPull) return inFlightPull;
    const { credentials } = get();
    if (!credentials) return;

    inFlightPull = (async () => {
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
    })().finally(() => {
      inFlightPull = null;
    });

    return inFlightPull;
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

      // importAll re-encrypts data with current keys, but we need keys
      // derived from the cloud passphrase for future sessions
      const rekeyResult = await rekeyFromPassphrase(passphrase, { sync: true });
      if (!rekeyResult.ok) {
        set({ status: "error", error: rekeyResult.error });
        return rekeyResult;
      }

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

    const rekeyResult = await rekeyFromPassphrase(passphrase, { sync: true });
    if (!rekeyResult.ok) {
      set({ status: "error", error: rekeyResult.error });
      return rekeyResult;
    }

    set({
      credentials,
      status: "synced",
      lastSyncedAt: pushResult.value,
      error: null,
    });
    return ok(true);
  },
}));
