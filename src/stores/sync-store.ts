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
import { clearLicenseToken } from "../core/license/license-token-store.ts";
import type { Result } from "../utils/result.ts";
import { ok, err } from "../utils/result.ts";

export type SyncStatus = "local-only" | "syncing" | "synced" | "error";

/**
 * Why a grace-migration dialog is pending. The store sets this when a sync
 * action fails in a way the user can recover from without losing reading
 * data — currently only `license-required` (existing cloud-sync user opens
 * the app after the paywall launches and the server returns 401 with
 * `error: "license required"`). Future migration causes (e.g. unverified
 * vault format, server-side revocation) would extend this union; the UI
 * renders one `SyncMigrationDialog` keyed off the discriminant.
 */
export type PendingMigration = "license-required";

const DEBOUNCE_MS = 5000;
const MAX_JITTER_MS = 30000;

type SwitchMode = "replace" | "merge";

interface SyncStore {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  credentials: SyncCredentials | null;
  /** Non-null when sync hit a recoverable wall the user must decide how to handle. See PendingMigration. */
  pendingMigration: PendingMigration | null;

  enableSync: (passphrase: string) => Promise<void>;
  restoreSync: (credentials: SyncCredentials) => void;
  /**
   * Disable sync on this device. Drops in-memory credentials, removes
   * the persisted vault keys, and flips status back to `local-only`.
   * PURELY LOCAL — does NOT touch the server. Idempotent.
   *
   * To also delete the server-side vault, call `deleteCloudVault()`
   * BEFORE `disableSync()` (it reads credentials that disableSync
   * clears) — see ADR forthcoming.
   */
  disableSync: () => Promise<void>;
  /**
   * Delete the encrypted vault on the server. Single network call;
   * does NOT mutate local state. Returns `err("no-credentials")` when
   * the store has no credentials to derive the vault id from.
   *
   * Ordering invariant: must run before `disableSync()` — once
   * credentials are cleared, the vault id can't be re-derived.
   */
  deleteCloudVault: () => Promise<Result<void>>;
  /**
   * Sign out of FeedZero Personal on this device. Clears the local
   * license token and disables sync locally. KEEPS the server vault
   * intact (the user can reactivate later and pull it back) and KEEPS
   * local IndexedDB feeds + articles (the user keeps reading on the
   * free tier on this device).
   */
  deactivateLocal: () => Promise<void>;
  logout: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  /** Close the migration dialog without taking any action. */
  dismissPendingMigration: () => void;
  /**
   * Explicit "replace local with cloud" — bypasses pull's in-flight dedup
   * and the debounced push timer, then refreshes the in-memory feed and
   * article stores so the UI reflects the imported vault immediately.
   * Used by the Settings → Restore from cloud button.
   */
  forceResync: () => Promise<Result<{ feedCount: number }>>;
  scheduleSyncPush: () => void;
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

/**
 * Detects the server's "license required" 401 in a pullVault error string.
 * sync-handler.ts emits `{"ok":false,"error":"license required",...}` for
 * authed endpoints when LAUNCH_PAID_TIER=1 and the request lacks a valid
 * bearer; pullVault wraps that into `Sync pull failed (401): {...}`.
 *
 * Substring match (not regex) — the server payload is JSON-encoded and we
 * only care about the human-readable error field. Future server changes
 * to the error string need to coordinate with this matcher; see
 * tests/stores/sync-store.test.ts for the contract.
 */
function isLicenseRequiredError(message: string): boolean {
  return message.includes("license required");
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: "local-only",
  lastSyncedAt: null,
  error: null,
  credentials: null,
  pendingMigration: null,

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

  dismissPendingMigration: () => {
    set({ pendingMigration: null });
  },

  disableSync: async () => {
    clearPendingTimers();
    // Purely local: drop vault keys + clear in-memory credentials.
    // Idempotent — calling twice yields the same final state.
    // To also delete the server vault, call deleteCloudVault() FIRST
    // (it needs the credentials this method clears).
    removeVaultKeys();
    set({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
      pendingMigration: null,
    });
  },

  deleteCloudVault: async () => {
    const { credentials } = get();
    if (!credentials) return err("no-credentials");
    const result = await deleteVault(credentials);
    if (!result.ok) return err(result.error);
    return ok(undefined);
  },

  deactivateLocal: async () => {
    // Clear the license token first so any sync errors after this
    // point don't leave the user "paid + sync broken". The store's
    // license-store cross-tab listener picks up the token removal and
    // flips tier → free.
    clearLicenseToken();
    await get().disableSync();
    // Nudge license-store to re-resolve tier in this tab (the storage
    // event from clearLicenseToken only fires in OTHER tabs).
    const { useLicenseStore } = await import("./license-store.ts");
    void useLicenseStore.getState().refresh();
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
        const pendingMigration: PendingMigration | null =
          isLicenseRequiredError(pullResult.error) ? "license-required" : null;
        set({ status: "error", error: pullResult.error, pendingMigration });
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

  forceResync: async () => {
    const { credentials } = get();
    if (!credentials) {
      return err("Not signed in to cloud; cannot restore");
    }

    // Cancel any pending push so it can't fire after our import and
    // overwrite cloud with stale local state.
    clearPendingTimers();

    set({ status: "syncing", error: null });

    const pullResult = await pullVault(credentials);
    if (!pullResult.ok) {
      set({ status: "error", error: pullResult.error });
      return err(pullResult.error);
    }

    const importResult = await importVault(pullResult.value);
    if (!importResult.ok) {
      set({ status: "error", error: importResult.error });
      return err(importResult.error);
    }

    // Refresh in-memory stores so the UI shows the imported vault
    // without waiting for the user to navigate. Lazy-imports avoid
    // a circular dependency on app boot.
    const { useFeedStore } = await import("./feed-store.ts");
    await useFeedStore.getState().loadFeeds();
    const { useArticleStore } = await import("./article-store.ts");
    await useArticleStore.getState().preloadAll();

    set({ status: "synced", lastSyncedAt: Date.now(), error: null });
    return ok({ feedCount: pullResult.value.feeds.length });
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
