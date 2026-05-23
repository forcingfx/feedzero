import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { LOCAL_STORAGE } from "../../../packages/core/src/utils/constants";
import {
  deriveKey,
  deriveHmacKey,
  exportCryptoKey,
  generateSalt,
} from "./crypto.ts";
import { deriveVaultId, deriveVaultKey } from "../sync/vault-crypto.ts";

/** Serializable key material stored in localStorage (JWK format). */
export interface StoredKeyMaterial {
  dbKeyJwk: JsonWebKey;
  hmacKeyJwk: JsonWebKey;
  dbSalt: number[];
  vaultId?: string;
  vaultKeyJwk?: JsonWebKey;
}

/**
 * Derive all cryptographic keys from a passphrase, export them as JWKs,
 * and persist to localStorage. The raw passphrase is not stored.
 * If dbSalt is provided, reuses it; otherwise generates a new one.
 */
export async function deriveAndStoreKeys(
  passphrase: string,
  dbSalt?: Uint8Array,
  options?: { includeVaultKeys: boolean },
): Promise<Result<StoredKeyMaterial>> {
  try {
    const salt = dbSalt ?? generateSalt();

    const dbKeyResult = await deriveKey(passphrase, salt, {
      extractable: true,
    });
    if (!dbKeyResult.ok) return dbKeyResult;

    const hmacKeyResult = await deriveHmacKey(passphrase, {
      extractable: true,
    });
    if (!hmacKeyResult.ok) return hmacKeyResult;

    const material: StoredKeyMaterial = {
      dbKeyJwk: await exportCryptoKey(dbKeyResult.value),
      hmacKeyJwk: await exportCryptoKey(hmacKeyResult.value),
      dbSalt: Array.from(salt),
    };

    if (options?.includeVaultKeys) {
      const vaultIdResult = await deriveVaultId(passphrase);
      if (!vaultIdResult.ok) return vaultIdResult;

      const vaultKeyResult = await deriveVaultKey(passphrase, {
        extractable: true,
      });
      if (!vaultKeyResult.ok) return vaultKeyResult;

      material.vaultId = vaultIdResult.value;
      material.vaultKeyJwk = await exportCryptoKey(vaultKeyResult.value);
    }

    localStorage.setItem(LOCAL_STORAGE.DERIVED_KEYS, JSON.stringify(material));
    return ok(material);
  } catch (e) {
    return err(`Failed to derive and store keys: ${(e as Error).message}`);
  }
}

/**
 * Load stored key material from localStorage.
 * Returns null if no keys are stored.
 */
export function loadStoredKeys(): StoredKeyMaterial | null {
  const raw = localStorage.getItem(LOCAL_STORAGE.DERIVED_KEYS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredKeyMaterial;
  } catch {
    return null;
  }
}

/**
 * Remove stored key material from localStorage.
 */
export function clearStoredKeys(): void {
  localStorage.removeItem(LOCAL_STORAGE.DERIVED_KEYS);
}
