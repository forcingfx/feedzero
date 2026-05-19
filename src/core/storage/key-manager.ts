import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { LOCAL_STORAGE, CRYPTO } from "../../utils/constants.ts";
import {
  deriveKey,
  deriveHmacKey,
  exportCryptoKey,
  importCryptoKey,
} from "./crypto.ts";
import { deriveVaultId, deriveVaultKey } from "../sync/vault-crypto.ts";
import {
  open,
  openWithKeys,
  deleteDatabase,
  getFeeds,
  getSalt,
} from "./db.ts";

/**
 * Verify the key-data coupling invariant in code (not just docs).
 *
 * The invariant from CLAUDE.md: stored derived keys must always be
 * able to decrypt the local IndexedDB contents. Any operation that
 * modifies stored keys without re-encrypting data, or re-encrypts data
 * without updating stored keys, is a bug.
 *
 * Mechanism: read one record (via `getFeeds`, the same canary `restore`
 * uses) using the current in-memory `cryptoKey`. If decryption fails,
 * keys and data are drifted — the caller's flow is structurally wrong.
 *
 * Call sites: end of every flow that touches encryption keys. Today:
 * `initFresh` (after open + store), `applyCloudVault` (after close +
 * delete + open + import + persist), and `restore` (implicit via its
 * existing canary). Adding a new key-touching flow without an
 * assertion call is the kind of regression issue #117 exposed.
 */
export async function assertKeyDataCoupling(): Promise<Result<void>> {
  const result = await getFeeds();
  if (!result.ok) {
    return err(
      `Key-data coupling violated: stored keys cannot decrypt local data (${result.error})`,
    );
  }
  return ok(undefined);
}
import type { SyncCredentials } from "../sync/sync-service.ts";

/** Serializable key material stored in localStorage (JWK format). */
export interface StoredKeyMaterial {
  dbKeyJwk: JsonWebKey;
  hmacKeyJwk: JsonWebKey;
  dbSalt: number[];
  vaultId?: string;
  vaultKeyJwk?: JsonWebKey;
}

export type RestoreStatus =
  | { status: "ready"; isSyncUser: boolean; credentials: SyncCredentials | null }
  | { status: "no-keys" }
  | { status: "invalid-keys" };

// --- localStorage persistence ---

function loadStoredKeys(): StoredKeyMaterial | null {
  const raw = localStorage.getItem(LOCAL_STORAGE.DERIVED_KEYS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredKeyMaterial;
  } catch {
    return null;
  }
}

function storeKeys(material: StoredKeyMaterial): void {
  localStorage.setItem(LOCAL_STORAGE.DERIVED_KEYS, JSON.stringify(material));
}

function clearAllStorage(): void {
  localStorage.removeItem(LOCAL_STORAGE.DERIVED_KEYS);
  localStorage.removeItem(LOCAL_STORAGE.ONBOARDING_COMPLETE);
  localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
}

// --- Best-effort vault cleanup ---

async function tryDeleteServerVault(): Promise<void> {
  const storedKeys = loadStoredKeys();
  if (!storedKeys?.vaultId || !storedKeys?.vaultKeyJwk) return;

  try {
    const vaultKey = await importCryptoKey(storedKeys.vaultKeyJwk, {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH,
    });
    const { deleteVault } = await import("../sync/sync-service.ts");
    await deleteVault({ vaultId: storedKeys.vaultId, vaultKey });
  } catch {
    // Best-effort — vault is encrypted and unreadable without passphrase
  }
}

// --- Key derivation helpers ---

async function deriveAndExportDbKeys(
  passphrase: string,
  salt: Uint8Array,
): Promise<Result<{ dbKeyJwk: JsonWebKey; hmacKeyJwk: JsonWebKey }>> {
  const dbKeyResult = await deriveKey(passphrase, salt, { extractable: true });
  if (!dbKeyResult.ok) return dbKeyResult;

  const hmacKeyResult = await deriveHmacKey(passphrase, { extractable: true });
  if (!hmacKeyResult.ok) return hmacKeyResult;

  return ok({
    dbKeyJwk: await exportCryptoKey(dbKeyResult.value),
    hmacKeyJwk: await exportCryptoKey(hmacKeyResult.value),
  });
}

async function deriveVaultMaterial(
  passphrase: string,
): Promise<Result<{ vaultId: string; vaultKeyJwk: JsonWebKey; vaultKey: CryptoKey }>> {
  const [vaultIdResult, vaultKeyResult] = await Promise.all([
    deriveVaultId(passphrase),
    deriveVaultKey(passphrase, { extractable: true }),
  ]);
  if (!vaultIdResult.ok) return vaultIdResult;
  if (!vaultKeyResult.ok) return vaultKeyResult;

  return ok({
    vaultId: vaultIdResult.value,
    vaultKeyJwk: await exportCryptoKey(vaultKeyResult.value),
    vaultKey: vaultKeyResult.value,
  });
}

// --- Public API ---

/**
 * Initialize a fresh database with a new passphrase.
 * Deletes any existing DB and vault first (atomic: all-or-nothing).
 * Used during onboarding for both local and sync users.
 */
export async function initFresh(
  passphrase: string,
  options?: { sync: boolean; skipServerCleanup?: boolean },
): Promise<Result<{ credentials: SyncCredentials | null }>> {
  try {
    // 1. Clean up any previous session
    if (!options?.skipServerCleanup) {
      await tryDeleteServerVault();
    }
    await deleteDatabase();

    // 2. Open fresh DB
    const openResult = await open(passphrase);
    if (!openResult.ok) return openResult;

    // 3. Derive and store keys
    const saltResult = await getSalt();
    if (!saltResult.ok) return saltResult;
    const salt = saltResult.value;

    const keysResult = await deriveAndExportDbKeys(passphrase, salt);
    if (!keysResult.ok) return keysResult;

    const material: StoredKeyMaterial = {
      ...keysResult.value,
      dbSalt: Array.from(salt),
    };

    let credentials: SyncCredentials | null = null;

    if (options?.sync) {
      const vaultResult = await deriveVaultMaterial(passphrase);
      if (!vaultResult.ok) {
        // Roll back: close DB, clear everything
        await deleteDatabase();
        return vaultResult;
      }

      material.vaultId = vaultResult.value.vaultId;
      material.vaultKeyJwk = vaultResult.value.vaultKeyJwk;

      credentials = {
        vaultId: vaultResult.value.vaultId,
        vaultKey: vaultResult.value.vaultKey,
      };
    }

    // 4. Persist keys only after all derivation succeeds (atomic)
    storeKeys(material);
    localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, options?.sync ? "sync" : "local");

    // 5. Verify the key-data coupling invariant. If this fails, the
    //    function's contract is broken and we want to know loudly.
    //    A freshly-initialized DB has no records, so getFeeds returns
    //    an empty list — which is `ok([])`, not an error. The check
    //    surfaces decryption-key mismatch, not "empty DB."
    const couplingResult = await assertKeyDataCoupling();
    if (!couplingResult.ok) {
      await deleteDatabase();
      clearAllStorage();
      return err(couplingResult.error);
    }

    return ok({ credentials });
  } catch (e) {
    // Roll back on any unexpected error
    await deleteDatabase();
    clearAllStorage();
    return err(`Initialization failed: ${(e as Error).message}`);
  }
}

/**
 * Restore a session from stored keys.
 * Validates keys by attempting to read feeds (canary check).
 * Returns status indicating whether restoration succeeded.
 */
export async function restore(): Promise<RestoreStatus> {
  const storedKeys = loadStoredKeys();
  if (!storedKeys) return { status: "no-keys" };

  const result = await openWithKeys(storedKeys.dbKeyJwk, storedKeys.hmacKeyJwk);
  if (!result.ok) return { status: "invalid-keys" };

  // Canary check: prove decryption works
  const feedsResult = await getFeeds();
  if (!feedsResult.ok) return { status: "invalid-keys" };

  const isSyncUser =
    localStorage.getItem(LOCAL_STORAGE.STORAGE_MODE) === "sync";
  let credentials: SyncCredentials | null = null;

  if (isSyncUser && storedKeys.vaultId && storedKeys.vaultKeyJwk) {
    try {
      const vaultKey = await importCryptoKey(storedKeys.vaultKeyJwk, {
        name: CRYPTO.ALGORITHM,
        length: CRYPTO.KEY_LENGTH,
      });
      credentials = { vaultId: storedKeys.vaultId, vaultKey };
    } catch {
      // Vault keys corrupted — still return ready, just without sync
    }
  }

  return { status: "ready", isSyncUser, credentials };
}

/**
 * Add vault keys to an existing local-only session.
 * Preserves current DB keys, adds vault keys alongside them.
 * Does NOT persist until the vault is successfully pushed (caller's responsibility).
 */
export async function addVaultKeys(
  passphrase: string,
): Promise<Result<SyncCredentials>> {
  const storedKeys = loadStoredKeys();
  if (!storedKeys) return err("No stored keys — cannot add vault keys");

  const vaultResult = await deriveVaultMaterial(passphrase);
  if (!vaultResult.ok) return vaultResult;

  // Persist DB keys + vault keys together
  const material: StoredKeyMaterial = {
    ...storedKeys,
    vaultId: vaultResult.value.vaultId,
    vaultKeyJwk: vaultResult.value.vaultKeyJwk,
  };
  storeKeys(material);
  localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "sync");

  return ok({
    vaultId: vaultResult.value.vaultId,
    vaultKey: vaultResult.value.vaultKey,
  });
}

/**
 * Remove vault keys, keeping DB keys intact.
 * Called when disabling sync after server vault is confirmed deleted.
 */
export function removeVaultKeys(): void {
  const storedKeys = loadStoredKeys();
  if (!storedKeys) return;

  const material: StoredKeyMaterial = {
    dbKeyJwk: storedKeys.dbKeyJwk,
    hmacKeyJwk: storedKeys.hmacKeyJwk,
    dbSalt: storedKeys.dbSalt,
  };
  storeKeys(material);
  localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
}

/**
 * Destroy everything: delete server vault, local DB, and all stored keys.
 *
 * WARNING: This is destructive AND remote. It issues a DELETE against
 * the sync server using the locally-stored vault credentials, which
 * removes the user's encrypted cloud backup. Never call from an
 * automated recovery path (boot-time canary failure, transient state
 * error, etc.) — only from a user-confirmed reset action. The only
 * legitimate caller is `useAppStore.getState().resetApp` (which is
 * wired to an explicit confirmation dialog in the UI). Adding more
 * callers requires either (a) routing through `resetApp`, or (b)
 * proving the new call site is gated by a user action.
 *
 * Issue #117 root-caused a chain of data loss to an automated
 * boot-time call of this function from `initializeReturningUser` —
 * see the comment there and ADR 018.
 */
export async function destroy(): Promise<void> {
  await tryDeleteServerVault();
  await deleteDatabase();
  clearAllStorage();
}

/**
 * Destroy local state only, preserving the server vault.
 * Used by logout (cloud backup preserved for recovery).
 */
export async function destroyLocal(): Promise<void> {
  await deleteDatabase();
  clearAllStorage();
}

/**
 * Persist derived keys (DB + optional vault) to localStorage so a
 * future session can re-open the same DB via `openWithKeys`.
 *
 * **Precondition:** the DB must already be open with keys derived from
 * `passphrase` (i.e. `open(passphrase)` was called and the in-memory
 * `cryptoKey` / `hmacKey` correspond to data on disk). This function
 * does NOT re-open the DB and does NOT update in-memory key state.
 *
 * Key-data coupling invariant: callers MUST ensure the passphrase
 * passed here matches the in-memory key state at the time of the call.
 * Re-deriving with the wrong passphrase here would write JWKs to
 * localStorage that can't decrypt the on-disk data — the next
 * `restore()` would fail the canary check, and (pre-#117 fix) would
 * have triggered the auto-destroy cascade.
 *
 * Replaces the pre-#117 `rekeyFromPassphrase`, whose JSDoc claimed to
 * "re-derive keys AND re-open the DB" but only did the first. Callers
 * (sync-store.switchToExistingCloud) were structurally guaranteed to
 * leave key/data drift on disk. Renamed to reveal the precondition.
 */
export async function persistDerivedKeysFromOpenDb(
  passphrase: string,
  options?: { sync: boolean },
): Promise<Result<{ credentials: SyncCredentials | null }>> {
  const saltResult = await getSalt();
  if (!saltResult.ok) return saltResult;
  const salt = saltResult.value;

  const keysResult = await deriveAndExportDbKeys(passphrase, salt);
  if (!keysResult.ok) return keysResult;

  const material: StoredKeyMaterial = {
    ...keysResult.value,
    dbSalt: Array.from(salt),
  };

  let credentials: SyncCredentials | null = null;

  if (options?.sync) {
    const vaultResult = await deriveVaultMaterial(passphrase);
    if (!vaultResult.ok) return vaultResult;

    material.vaultId = vaultResult.value.vaultId;
    material.vaultKeyJwk = vaultResult.value.vaultKeyJwk;
    credentials = {
      vaultId: vaultResult.value.vaultId,
      vaultKey: vaultResult.value.vaultKey,
    };
  }

  storeKeys(material);
  localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, options?.sync ? "sync" : "local");

  return ok({ credentials });
}
