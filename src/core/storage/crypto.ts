import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { CRYPTO } from "../../utils/constants.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedPayload {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Derive an AES-GCM key from a passphrase and salt using PBKDF2.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
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
      false,
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
