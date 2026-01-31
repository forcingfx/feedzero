import { ok, err } from '../../utils/result.js';
import { CRYPTO } from '../../utils/constants.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derive an AES-GCM key from a passphrase and salt using PBKDF2.
 * @param {string} passphrase
 * @param {Uint8Array} salt - 16 bytes
 * @returns {Promise<Result<CryptoKey>>}
 */
export async function deriveKey(passphrase, salt) {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: CRYPTO.PBKDF2_ITERATIONS,
        hash: CRYPTO.HASH,
      },
      keyMaterial,
      { name: CRYPTO.ALGORITHM, length: CRYPTO.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    );
    return ok(key);
  } catch (e) {
    return err(`Key derivation failed: ${e.message}`);
  }
}

/**
 * Generate a random salt.
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(CRYPTO.SALT_LENGTH));
}

/**
 * Encrypt a JS value (serialized as JSON).
 * Returns { iv, ciphertext } as Uint8Arrays.
 */
export async function encrypt(key, data) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(CRYPTO.IV_LENGTH));
    const plaintext = encoder.encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: CRYPTO.ALGORITHM, iv },
      key,
      plaintext,
    );
    return ok({ iv, ciphertext: new Uint8Array(ciphertext) });
  } catch (e) {
    return err(`Encryption failed: ${e.message}`);
  }
}

/**
 * Decrypt ciphertext back to a JS value.
 */
export async function decrypt(key, iv, ciphertext) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: CRYPTO.ALGORITHM, iv },
      key,
      ciphertext,
    );
    return ok(JSON.parse(decoder.decode(plaintext)));
  } catch (e) {
    return err(`Decryption failed: ${e.message}`);
  }
}
