import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { SYNC } from "../../utils/constants.ts";
import { exportAll, importAll } from "../storage/db.ts";
import {
  deriveVaultId,
  deriveVaultKey,
  encryptVault,
  decryptVault,
} from "./vault-crypto.ts";
import type { VaultData, EncryptedVault } from "./types.ts";

/**
 * Export all local data as a VaultData object.
 */
export async function exportVault(): Promise<Result<VaultData>> {
  const result = await exportAll();
  if (!result.ok) return result;
  return ok({
    version: SYNC.FORMAT_VERSION,
    exportedAt: Date.now(),
    feeds: result.value.feeds,
    articles: result.value.articles,
  });
}

/**
 * Replace all local data with the contents of a VaultData object.
 */
export async function importVault(vault: VaultData): Promise<Result<boolean>> {
  return importAll(vault.feeds, vault.articles);
}

/**
 * Encrypt local data and push it to the sync server.
 * Returns the server-reported timestamp on success.
 */
export async function pushVault(passphrase: string): Promise<Result<number>> {
  try {
    const [vaultIdResult, keyResult, vaultResult] = await Promise.all([
      deriveVaultId(passphrase),
      deriveVaultKey(passphrase),
      exportVault(),
    ]);
    if (!vaultIdResult.ok) return vaultIdResult;
    if (!keyResult.ok) return keyResult;
    if (!vaultResult.ok) return vaultResult;

    const encryptedResult = await encryptVault(
      keyResult.value,
      vaultResult.value,
    );
    if (!encryptedResult.ok) return encryptedResult;

    const response = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultId: vaultIdResult.value,
        vault: encryptedResult.value,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return err(`Sync push failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return ok(data.updatedAt ?? Date.now());
  } catch (e) {
    return err(`Sync push failed: ${(e as Error).message}`);
  }
}

/**
 * Delete the encrypted vault from the sync server.
 * Used when a user switches from sync to local-only.
 */
export async function deleteVault(
  passphrase: string,
): Promise<Result<boolean>> {
  try {
    const vaultIdResult = await deriveVaultId(passphrase);
    if (!vaultIdResult.ok) return vaultIdResult;

    const response = await fetch(`/api/sync?vaultId=${vaultIdResult.value}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const text = await response.text();
      return err(`Vault deletion failed (${response.status}): ${text}`);
    }

    return ok(true);
  } catch (e) {
    return err(`Vault deletion failed: ${(e as Error).message}`);
  }
}

/**
 * Pull encrypted vault from the sync server and decrypt it.
 * Does NOT import into local DB — caller decides what to do with the data.
 */
export async function pullVault(
  passphrase: string,
): Promise<Result<VaultData>> {
  try {
    const [vaultIdResult, keyResult] = await Promise.all([
      deriveVaultId(passphrase),
      deriveVaultKey(passphrase),
    ]);
    if (!vaultIdResult.ok) return vaultIdResult;
    if (!keyResult.ok) return keyResult;

    const response = await fetch(`/api/sync?vaultId=${vaultIdResult.value}`);

    if (!response.ok) {
      const text = await response.text();
      return err(`Sync pull failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.vault) {
      return err("Server returned no vault data");
    }

    return decryptVault(keyResult.value, data.vault as EncryptedVault);
  } catch (e) {
    return err(`Sync pull failed: ${(e as Error).message}`);
  }
}
