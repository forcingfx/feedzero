import { create } from "zustand";
import {
  pushVault,
  pullVault,
  importVault,
  deleteVault,
} from "../core/sync/sync-service";
import { LOCAL_STORAGE } from "../utils/constants.ts";

export type SyncStatus = "local-only" | "syncing" | "synced" | "error";

const DEBOUNCE_MS = 5000;

interface SyncStore {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  passphrase: string | null;
  dialogOpen: boolean;

  /** Enable sync: store passphrase, push vault, transition to synced. */
  enableSync: (passphrase: string) => Promise<void>;
  /** Restore sync state from a known passphrase without pushing (e.g., after recovery pull). */
  restoreSync: (passphrase: string) => void;
  /** Disable sync: delete server vault, reset state, clear persisted data. */
  disableSync: () => Promise<void>;
  /** Push local data to the server. */
  push: () => Promise<void>;
  /** Pull data from the server and import into local DB. */
  pull: () => Promise<void>;
  /** Schedule a debounced push (5s after last call). */
  scheduleSyncPush: () => void;
  setDialogOpen: (open: boolean) => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: "local-only",
  lastSyncedAt: null,
  error: null,
  passphrase: null,
  dialogOpen: false,

  enableSync: async (passphrase) => {
    set({ passphrase, status: "syncing", error: null });
    localStorage.setItem(LOCAL_STORAGE.SYNC_PASSPHRASE, passphrase);
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");

    const result = await pushVault(passphrase);
    if (result.ok) {
      set({ status: "synced", lastSyncedAt: result.value, error: null });
    } else {
      set({ status: "error", error: result.error });
    }
  },

  restoreSync: (passphrase) => {
    localStorage.setItem(LOCAL_STORAGE.SYNC_PASSPHRASE, passphrase);
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");
    set({
      passphrase,
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
    });
  },

  disableSync: async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const { passphrase } = get();
    if (passphrase) {
      await deleteVault(passphrase);
    }
    localStorage.removeItem(LOCAL_STORAGE.SYNC_PASSPHRASE);
    localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
    set({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      passphrase: null,
    });
  },

  push: async () => {
    const { passphrase } = get();
    if (!passphrase) return;

    const result = await pushVault(passphrase);
    if (result.ok) {
      set({ status: "synced", lastSyncedAt: result.value, error: null });
    } else {
      set({ status: "error", error: result.error });
    }
  },

  pull: async () => {
    const { passphrase } = get();
    if (!passphrase) return;

    set({ status: "syncing", error: null });
    const pullResult = await pullVault(passphrase);
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
    const { passphrase } = get();
    if (!passphrase) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      get().push();
    }, DEBOUNCE_MS);
  },

  setDialogOpen: (open) => set({ dialogOpen: open }),
}));
