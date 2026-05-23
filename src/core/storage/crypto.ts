import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { CRYPTO } from "../../../packages/core/src/utils/constants";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HMAC_SALT = encoder.encode("feedzero:index-hmac:v1");

export interface EncryptedPayload {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

interface DeriveOptions {
  extractable?: boolean;
}

/**
 * Derive an AES-GCM key from a passphrase and salt using PBKDF2.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  options?: DeriveOptions,
): Promise<Result<CryptoKey>> {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: CRYPTO.PBKDF2_ITERATIONS,
        hash: CRYPTO.HASH,
      },
      keyMaterial,
      { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_LENGTH },
      options?.extractable ?? false,
      ["encrypt", "decrypt"],
    );
    return ok(key);
  } catch (e) {
    return err(`Key derivation failed: ${(e as Error).message}`);
  }
}

/**
 * Derive raw bytes from a passphrase and salt using PBKDF2.
 * Used for vault ID derivation and deterministic salt generation
 * where a CryptoKey is not needed.
 */
export async function deriveBytes(
  passphrase: string,
  salt: Uint8Array,
  length: number,
): Promise<Result<Uint8Array>> {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: CRYPTO.PBKDF2_ITERATIONS,
        hash: CRYPTO.HASH,
      },
      keyMaterial,
      length * 8,
    );
    return ok(new Uint8Array(bits));
  } catch (e) {
    return err(`Byte derivation failed: ${(e as Error).message}`);
  }
}

/**
 * Generate a random salt.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(CRYPTO.SALT_LENGTH));
}

/**
 * Encrypt a JS value (serialized as JSON).
 * Returns { iv, ciphertext } as Uint8Arrays.
 */
export async function encrypt(
  key: CryptoKey,
  data: unknown,
): Promise<Result<EncryptedPayload>> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(CRYPTO.IV_LENGTH));
    const plaintext = encoder.encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: CRYPTO.ALGORITHM, iv: iv as BufferSource },
      key,
      plaintext,
    );
    return ok({ iv, ciphertext: new Uint8Array(ciphertext) });
  } catch (e) {
    return err(`Encryption failed: ${(e as Error).message}`);
  }
}

/**
 * Derive an HMAC-SHA256 key from a passphrase using PBKDF2 with a
 * domain-separated static salt. Used to hash index fields before storage
 * so IndexedDB queries work without exposing plaintext values.
 */
export async function deriveHmacKey(
  passphrase: string,
  options?: DeriveOptions,
): Promise<Result<CryptoKey>> {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: HMAC_SALT as BufferSource,
        iterations: CRYPTO.PBKDF2_ITERATIONS,
        hash: CRYPTO.HASH,
      },
      keyMaterial,
      { name: "HMAC", hash: CRYPTO.HASH, length: CRYPTO.KEY_LENGTH },
      options?.extractable ?? false,
      ["sign"],
    );
    return ok(key);
  } catch (e) {
    return err(`HMAC key derivation failed: ${(e as Error).message}`);
  }
}

/**
 * Compute an HMAC-SHA256 hash of a value, returned as a 64-character hex string.
 * Used as a deterministic, non-reversible index field in IndexedDB.
 */
export async function hmacIndex(
  key: CryptoKey,
  value: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Export a CryptoKey as a JWK object for localStorage persistence.
 * The key must have been created with extractable: true.
 */
export async function exportCryptoKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

/**
 * Import a JWK back into a non-extractable CryptoKey.
 * The algorithm must match the original key's algorithm.
 */
export async function importCryptoKey(
  jwk: JsonWebKey,
  algorithm: AlgorithmIdentifier | AesKeyAlgorithm | HmacImportParams,
): Promise<CryptoKey> {
  const usages: KeyUsage[] = (jwk.key_ops as KeyUsage[] | undefined) ?? [];
  return crypto.subtle.importKey("jwk", jwk, algorithm, false, usages);
}

/**
 * Decrypt ciphertext back to a JS value.
 */
export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Result<unknown>> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: CRYPTO.ALGORITHM, iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return ok(JSON.parse(decoder.decode(plaintext)));
  } catch (e) {
    return err(`Decryption failed: ${(e as Error).message}`);
  }
}
