import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { SYNC } from "../../../packages/core/src/utils/constants";
import { deriveBytes, deriveKey, decrypt } from "../storage/crypto.ts";
import { uint8ArrayToBase64, base64ToUint8Array } from "../../../packages/core/src/utils/base64";
import {
  ARGON2ID_PRODUCTION_PARAMS,
  ARGON2ID_TEST_PARAMS,
  deriveArgon2idKey,
} from "../crypto/argon2.ts";
import type { VaultData, EncryptedVault, KdfSpec } from "./types.ts";

/**
 * Argon2id parameters used when constructing `DEFAULT_NEW_VAULT_KDF`.
 * Production always uses the OWASP-recommended cost (64 MiB, t=3, p=1).
 * The Vitest suite would otherwise pay ~700ms per new-vault derivation
 * across hundreds of tests — encryption correctness is independent of
 * cost, so the test path uses cheap params. Mirrors the PBKDF2 test
 * override in packages/core/src/utils/constants.ts.
 *
 * `process` is undefined in the browser bundle, so production and the
 * Hono server always use the full OWASP floor.
 */
const DEFAULT_NEW_VAULT_ARGON2ID_PARAMS =
  typeof process !== "undefined" && process.env.VITEST
    ? ARGON2ID_TEST_PARAMS
    : ARGON2ID_PRODUCTION_PARAMS;

/**
 * KDF spec used to encrypt every newly-created sync vault. Argon2id is
 * memory-hard and destroys the GPU/ASIC advantage that makes a 4-word
 * diceware passphrase brute-forceable offline. The full cost triple is
 * stamped on the envelope so we can raise this floor without orphaning
 * vaults written with older settings.
 */
export const DEFAULT_NEW_VAULT_KDF: KdfSpec = {
  kind: "argon2id",
  memoryKib: DEFAULT_NEW_VAULT_ARGON2ID_PARAMS.memoryKib,
  iterations: DEFAULT_NEW_VAULT_ARGON2ID_PARAMS.iterations,
  parallelism: DEFAULT_NEW_VAULT_ARGON2ID_PARAMS.parallelism,
};

/**
 * KDF spec assumed for envelopes written before the `kdf` field existed.
 * Every envelope without an explicit `kdf` was produced by `deriveKey`
 * (PBKDF2-SHA256 with 600,000 iterations), so the recovery flow uses
 * this when nothing else is available.
 */
export const LEGACY_KDF_SPEC: KdfSpec = { kind: "pbkdf2-600k" };

/**
 * Read the KDF spec from an envelope, falling back to the PBKDF2
 * legacy default when the field is absent. Always go through this
 * helper rather than reading `envelope.kdf` directly — the back-compat
 * default lives here so existing vaults stay readable.
 */
export function readKdfSpec(envelope: EncryptedVault): KdfSpec {
  return envelope.kdf ?? LEGACY_KDF_SPEC;
}

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
 * Derive the AES-GCM-256 vault encryption key from a passphrase.
 *
 * The KDF is selected by `kdfSpec`. When unset, defaults to the
 * legacy PBKDF2 spec so existing callers keep producing the same key
 * bytes for the same passphrase (recovery on a primary device with a
 * stored JWK relies on this — a silent switch would orphan the local
 * encrypted DB). New-signup callers and recovery-after-upgrade
 * callers should pass `DEFAULT_NEW_VAULT_KDF` or the spec read off
 * the cloud envelope via `readKdfSpec`.
 */
export async function deriveVaultKey(
  passphrase: string,
  options?: { extractable?: boolean; kdfSpec?: KdfSpec },
): Promise<Result<CryptoKey>> {
  const saltResult = await deriveEncryptionSalt(passphrase);
  if (!saltResult.ok) return saltResult;

  const spec = options?.kdfSpec ?? LEGACY_KDF_SPEC;
  if (spec.kind === "argon2id") {
    return deriveArgon2idKey(
      passphrase,
      saltResult.value,
      {
        memoryKib: spec.memoryKib,
        iterations: spec.iterations,
        parallelism: spec.parallelism,
      },
      { extractable: options?.extractable },
    );
  }
  return deriveKey(passphrase, saltResult.value, {
    extractable: options?.extractable,
  });
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
 *
 * When `kdfSpec` is provided, it is stamped on the envelope so the
 * recovery flow can pick the matching key-derivation function on a
 * new device. Omit it only for tests of legacy back-compat — production
 * callers (`pushVault` and the auto-upgrade path) always pass a spec.
 */
export async function encryptVault(
  key: CryptoKey,
  vault: VaultData,
  kdfSpec?: KdfSpec,
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
    const envelope: EncryptedVault = {
      version: SYNC.FORMAT_VERSION,
      iv: Array.from(iv),
      ciphertext: uint8ArrayToBase64(ct),
    };
    if (kdfSpec) envelope.kdf = kdfSpec;
    return ok(envelope);
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
