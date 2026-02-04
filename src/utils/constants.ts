export const DB_NAME = "feedzero";
export const DB_VERSION = 2;

export const CRYPTO = {
  ALGORITHM: "AES-GCM",
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  SALT_LENGTH: 16,
  PBKDF2_ITERATIONS: 100_000,
  HASH: "SHA-256",
} as const;

export const SCHEMA_VERSION = 1;

export const DEFAULT_PASSPHRASE = "feedzero-default-key";

export const LOCAL_STORAGE = {
  ONBOARDING_COMPLETE: "feedzero:onboarding-complete",
  SYNC_PASSPHRASE: "feedzero:sync-passphrase",
  STORAGE_MODE: "feedzero:storage-mode",
} as const;

const textEncoder = new TextEncoder();

export const SYNC = {
  /** Static salt for vault ID derivation (domain separation from encryption key). */
  VAULT_ID_SALT: textEncoder.encode("feedzero:vault-id:v1"),
  /** Static salt seed for deterministic encryption salt derivation. */
  ENCRYPTION_SALT_SEED: textEncoder.encode("feedzero:enc-salt:v1"),
  /** Vault ID is 32 bytes, rendered as 64-character hex string. */
  VAULT_ID_LENGTH: 32,
  /** Deterministic encryption salt length in bytes. */
  ENCRYPTION_SALT_LENGTH: 16,
  /** Maximum vault payload size in bytes (5 MB). */
  MAX_VAULT_SIZE: 5 * 1024 * 1024,
  /** Sync data format version for forward compatibility. */
  FORMAT_VERSION: 1,
} as const;
