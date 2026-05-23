import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { SYNC } from "../../utils/constants.ts";
import { deriveBytes, deriveKey, decrypt } from "../storage/crypto.ts";
import { uint8ArrayToBase64, base64ToUint8Array } from "../../utils/base64.ts";
import type { VaultData, EncryptedVault } from "./types.ts";

/** AES-GCM IV length in bytes. */
const IV_LENGTH = 12;

/**
 * Compress a Uint8Array with gzip via the Web standard CompressionStream.
 * No new dependency — available in every browser since 2023 and in Node ≥ 18.
 */
async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

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
 * Encrypt a VaultData object into an EncryptedVault using the current
 * FORMAT_VERSION's encoding (v4 = gzip-then-encrypt).
 *
 * The compress-before-encrypt order matters because encrypted bytes
 * are effectively random and cannot be compressed downstream by the
 * HTTP layer. For a real-world vault — feed metadata, article titles
 * + summaries, repeated structural keys — gzip typically shrinks the
 * payload 60–80%. Smaller ciphertext means smaller pushes, smaller
 * pulls, and smaller `padPayload` buckets in sync-service.
 */
export async function encryptVault(
  key: CryptoKey,
  vault: VaultData,
): Promise<Result<EncryptedVault>> {
  try {
    const json = JSON.stringify(vault);
    const jsonBytes = new TextEncoder().encode(json);
    const compressed = await gzipBytes(jsonBytes);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        compressed as BufferSource,
      ),
    );
    return ok({
      version: SYNC.FORMAT_VERSION,
      iv: Array.from(iv),
      ciphertext: uint8ArrayToBase64(ct),
    });
  } catch (e) {
    return err(`Vault encryption failed: ${(e as Error).message}`);
  }
}

/**
 * Decrypt an EncryptedVault back into VaultData. Dispatches on the
 * envelope's `version` field so a vault written by an older device
 * (v3, no gzip layer) still decrypts cleanly on this device.
 */
export async function decryptVault(
  key: CryptoKey,
  encrypted: EncryptedVault,
): Promise<Result<VaultData>> {
  const iv = new Uint8Array(encrypted.iv);
  const ciphertext = base64ToUint8Array(encrypted.ciphertext);

  // v3 and earlier: ciphertext is encrypt(JSON.stringify(vault)).
  // crypto.decrypt does the JSON.parse on the way out.
  if (encrypted.version < 4) {
    const result = await decrypt(key, iv, ciphertext);
    if (!result.ok) return result;
    return ok(result.value as VaultData);
  }

  // v4: ciphertext is encrypt(gzip(JSON.stringify(vault))). Decrypt to
  // raw bytes (NOT through crypto.decrypt's JSON.parse path), gunzip,
  // then parse.
  try {
    const plainCompressed = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
    );
    const jsonBytes = await gunzipBytes(plainCompressed);
    const vault = JSON.parse(new TextDecoder().decode(jsonBytes));
    return ok(vault as VaultData);
  } catch (e) {
    return err(`Vault decryption failed: ${(e as Error).message}`);
  }
}
