import { ok } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { SYNC } from "../../utils/constants.ts";
import { deriveBytes, deriveKey, encrypt, decrypt } from "../storage/crypto.ts";
import { uint8ArrayToBase64, base64ToUint8Array } from "../../utils/base64.ts";
import type { VaultData, EncryptedVault } from "./types.ts";

/**
 * Derive a 64-character hex vault ID from a passphrase.
 * Uses a dedicated PBKDF2 derivation with VAULT_ID_SALT for domain separation,
 * so the vault ID is cryptographically independent from the encryption key.
 */
export async function deriveVaultId(
  passphrase: string,
): Promise<Result<string>> {
  const result = await deriveBytes(
    passphrase,
    SYNC.VAULT_ID_SALT,
    SYNC.VAULT_ID_LENGTH,
  );
  if (!result.ok) return result;
  const hex = Array.from(result.value, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return ok(hex);
}

/**
 * Derive a deterministic 16-byte encryption salt from a passphrase.
 * Uses ENCRYPTION_SALT_SEED as the PBKDF2 salt for domain separation.
 */
export async function deriveEncryptionSalt(
  passphrase: string,
): Promise<Result<Uint8Array>> {
  return deriveBytes(
    passphrase,
    SYNC.ENCRYPTION_SALT_SEED,
    SYNC.ENCRYPTION_SALT_LENGTH,
  );
}

/**
 * Derive the AES-GCM-256 encryption key from a passphrase.
 * Two-step: derive deterministic salt, then derive key from passphrase + salt.
 */
export async function deriveVaultKey(
  passphrase: string,
  options?: { extractable?: boolean },
): Promise<Result<CryptoKey>> {
  const saltResult = await deriveEncryptionSalt(passphrase);
  if (!saltResult.ok) return saltResult;
  return deriveKey(passphrase, saltResult.value, options);
}

/**
 * Encrypt a VaultData object into an EncryptedVault.
 * The ciphertext is base64-encoded for JSON transport.
 */
export async function encryptVault(
  key: CryptoKey,
  vault: VaultData,
): Promise<Result<EncryptedVault>> {
  const encResult = await encrypt(key, vault);
  if (!encResult.ok) return encResult;
  return ok({
    version: SYNC.FORMAT_VERSION,
    iv: Array.from(encResult.value.iv),
    ciphertext: uint8ArrayToBase64(encResult.value.ciphertext),
  });
}

/**
 * Decrypt an EncryptedVault back into VaultData.
 */
export async function decryptVault(
  key: CryptoKey,
  encrypted: EncryptedVault,
): Promise<Result<VaultData>> {
  const iv = new Uint8Array(encrypted.iv);
  const ciphertext = base64ToUint8Array(encrypted.ciphertext);
  const result = await decrypt(key, iv, ciphertext);
  if (!result.ok) return result;
  return ok(result.value as VaultData);
}
