export const DB_NAME = "feedzero";
export const DB_VERSION = 3;

export const CRYPTO = {
  ALGORITHM: "AES-GCM",
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  SALT_LENGTH: 16,
  PBKDF2_ITERATIONS: 600_000,
  HASH: "SHA-256",
} as const;

export const SCHEMA_VERSION = 1;

/** Special feed ID for the global "All items" view. */
export const ALL_FEEDS_ID = "all";

/** Path for the built-in changelog Atom feed. Resolve with window.location.origin at runtime. */
export const CHANGELOG_FEED_PATH = "/api/changelog.xml";

export const LOCAL_STORAGE = {
  ONBOARDING_COMPLETE: "feedzero:onboarding-complete",
  STORAGE_MODE: "feedzero:storage-mode",
  DERIVED_KEYS: "feedzero:derived-keys",
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
