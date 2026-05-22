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
  persistDerivedKeysFromOpenDb,
  assertKeyDataCoupling,
} from "../core/storage/key-manager.ts";
import {
  close,
  deleteDatabase,
  open,
  getPreferencesUpdatedAt,
} from "../core/storage/db.ts";
import type { VaultData } from "../core/sync/types.ts";
import { clearLicenseToken } from "../core/license/license-token-store.ts";
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

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: "local-only",
  lastSyncedAt: null,
  error: null,
  credentials: null,

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
        set({ status: "error", error: pullResult.error });
        return;
      }

      const importResult = await importVault(
        await gatePreferencesByTimestamp(pullResult.value),
      );
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
    const { usePreferencesStore } = await import("./preferences-store.ts");
    await usePreferencesStore.getState().reload();

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

    // Mode-specific source data: either the cloud vault directly
    // (replace) or local merged with cloud (merge). The destructive
    // local rewrite happens INSIDE applyCloudVault — only after pull
    // succeeds. If pull fails, the local DB is untouched.
    if (mode === "replace") {
      const pullResult = await pullVault(credentials);
      if (!pullResult.ok) {
        set({ status: "error", error: pullResult.error });
        return pullResult;
      }

      const applyResult = await applyCloudVault(passphrase, pullResult.value);
      if (!applyResult.ok) {
        set({ status: "error", error: applyResult.error });
        return applyResult;
      }

      set({
        credentials,
        status: "synced",
        lastSyncedAt: Date.now(),
        error: null,
      });
      return ok(true);
    }

    // Merge mode: snapshot local, pull cloud, merge in memory, then
    // apply the merged result. Push the (now-cloud-passphrase-encrypted)
    // result so the cloud reflects the merge.
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

    const applyResult = await applyCloudVault(passphrase, mergeResult.value);
    if (!applyResult.ok) {
      set({ status: "error", error: applyResult.error });
      return applyResult;
    }

    const pushResult = await pushVault(credentials);
    if (!pushResult.ok) {
      set({ status: "error", error: pushResult.error });
      return err(pushResult.error);
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

/**
 * Apply timestamp last-write-wins to the preferences carried by a pulled
 * vault. The routine pull path (boot, refreshAll) does a pure replace via
 * importVault, so without this guard a stale cloud copy would clobber a
 * just-changed local preference — including the device's own debounced
 * push not yet landed (the self-clobber-on-refresh race). When local
 * preferences are at least as new as the cloud's, we strip them from the
 * vault (set to undefined), which importAll reads as "no opinion — leave
 * the local row untouched". Cloud-wins is intentionally NOT applied in
 * forceResync / switchToExistingCloud, which are explicit cloud-authority
 * actions.
 */
async function gatePreferencesByTimestamp(
  vault: VaultData,
): Promise<VaultData> {
  if (vault.preferences === undefined) return vault;
  const localTsResult = await getPreferencesUpdatedAt();
  const localTs = localTsResult.ok ? (localTsResult.value ?? 0) : 0;
  const cloudTs = vault.preferencesUpdatedAt ?? 0;
  if (localTs >= cloudTs) {
    return { ...vault, preferences: undefined, preferencesUpdatedAt: undefined };
  }
  return vault;
}

/**
 * Atomically replace local DB contents with a cloud-derived vault.
 *
 * **The fix for issue #117's key/data drift.** Previously the flow was
 * `importVault(...)` → `rekeyFromPassphrase(passphrase)`, which encrypted
 * the cloud data under the OLD in-memory keys while writing NEW keys to
 * localStorage. The next session's canary check failed → auto-destroy
 * cascade deleted the server vault.
 *
 * The correct order:
 *  1. Close the current DB (drops stale in-memory crypto state).
 *  2. Delete local IndexedDB (wipes data encrypted under old keys).
 *  3. `open(passphrase)` — derives fresh DB keys from the cloud
 *     passphrase and sets them as the new in-memory `cryptoKey`.
 *  4. `importVault(...)` — encrypts the cloud data under the new keys.
 *  5. `persistDerivedKeysFromOpenDb` — writes the now-aligned keys to
 *     localStorage. After this, `restore()` on a future session opens
 *     the DB with keys that match what's on disk. Canary check passes.
 *  6. Refresh in-memory stores (feeds, articles) so the sidebar
 *     reflects the newly-imported data immediately — mirrors the
 *     pattern in `forceResync` and fixes the "sidebar stays empty
 *     after restore" symptom from #117.
 *
 * The function is destructive after step 2. If `importVault` fails,
 * local data is gone, but the source `vault` argument is still in
 * memory and the user can retry. The cloud vault is never modified by
 * this function (no push, no delete).
 */
async function applyCloudVault(
  passphrase: string,
  vault: import("../core/sync/types.ts").VaultData,
): Promise<Result<boolean>> {
  close();
  const deleteResult = await deleteDatabase();
  if (!deleteResult.ok) return deleteResult;

  const openResult = await open(passphrase);
  if (!openResult.ok) return openResult;

  const importResult = await importVault(vault);
  if (!importResult.ok) return importResult;

  const persistResult = await persistDerivedKeysFromOpenDb(passphrase, {
    sync: true,
  });
  if (!persistResult.ok) return persistResult;

  // Mechanical invariant check: stored keys MUST decrypt on-disk data.
  // If this fails, the close/delete/open/import sequence above has
  // somehow drifted (regression). We surface an error instead of
  // letting the next session's canary fail and trigger a destroy.
  const couplingResult = await assertKeyDataCoupling();
  if (!couplingResult.ok) return couplingResult;

  // Refresh in-memory store state. Without this, the sidebar shows
  // empty until the user navigates (issue #117 symptom). Lazy imports
  // avoid a circular dependency at module load.
  const { useFeedStore } = await import("./feed-store.ts");
  await useFeedStore.getState().loadFeeds();
  const { useArticleStore } = await import("./article-store.ts");
  await useArticleStore.getState().preloadAll();
  const { usePreferencesStore } = await import("./preferences-store.ts");
  await usePreferencesStore.getState().reload();

  return ok(true);
}
