import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";

/**
 * Argon2id cost parameters. The triple (m, t, p) is stamped on every
 * encrypted sync vault envelope so a vault written with one cost can
 * still be opened on a device running with a different cost setting.
 */
export interface Argon2idParams {
  /** Memory cost in KiB. 65536 = 64 MiB. */
  memoryKib: number;
  /** Number of passes over the memory. */
  iterations: number;
  /** Number of parallel lanes. */
  parallelism: number;
}

/**
 * OWASP-recommended Argon2id parameters for a 2020-era laptop. Roughly
 * 700ms per derivation, dominated by the 64 MiB memory pass.
 *
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
 */
export const ARGON2ID_PRODUCTION_PARAMS: Argon2idParams = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 1,
};

/**
 * OWASP minimum Argon2id parameters for memory-constrained devices
 * (old mobile, `navigator.deviceMemory < 2`). ~300ms per derivation.
 */
export const ARGON2ID_MOBILE_PARAMS: Argon2idParams = {
  memoryKib: 19456,
  iterations: 2,
  parallelism: 1,
};

/**
 * Cheap params for the Vitest suite — round-trip correctness is
 * independent of cost, and the production floor adds seconds per test
 * for no value. Mirrors the PBKDF2_ITERATIONS test override in
 * packages/core/src/utils/constants.ts.
 */
export const ARGON2ID_TEST_PARAMS: Argon2idParams = {
  memoryKib: 256,
  iterations: 1,
  parallelism: 1,
};

const KEY_LENGTH_BYTES = 32;

/**
 * Derive an AES-GCM-256 CryptoKey from a passphrase via Argon2id.
 *
 * Argon2id is memory-hard — each guess costs `memoryKib` of RAM in
 * addition to compute — which destroys the GPU/ASIC speedup that
 * makes PBKDF2 brute-force cheap. The cost stamped on the envelope
 * (see KdfSpec) lets a vault written with old params still decrypt
 * after the production defaults are raised.
 *
 * Lazy-loads `hash-wasm` so the WASM blob is only fetched when key
 * derivation actually runs (onboarding + recovery, ~once per device).
 */
export async function deriveArgon2idKey(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2idParams,
  options?: { extractable?: boolean },
): Promise<Result<CryptoKey>> {
  try {
    const { argon2id } = await import("hash-wasm");
    const raw = (await argon2id({
      password: passphrase,
      salt,
      parallelism: params.parallelism,
      iterations: params.iterations,
      memorySize: params.memoryKib,
      hashLength: KEY_LENGTH_BYTES,
      outputType: "binary",
    })) as Uint8Array;

    const key = await crypto.subtle.importKey(
      "raw",
      raw as BufferSource,
      { name: "AES-GCM", length: 256 },
      options?.extractable ?? false,
      ["encrypt", "decrypt"],
    );
    return ok(key);
  } catch (e) {
    return err(`Argon2id key derivation failed: ${(e as Error).message}`);
  }
}
