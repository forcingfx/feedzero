export const DB_NAME = "feedzero";
export const DB_VERSION = 4;

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

/**
 * URL of the FeedZero release notes Atom feed, published by the landing site
 * at feedzero.app. The feed has open CORS so the app can fetch it directly
 * from my.feedzero.app without going through the proxy.
 *
 * Used for:
 *  - auto-subscribing on first launch (src/app.tsx)
 *  - the "What's new" button (src/components/layout/app-sidebar.tsx)
 *  - pinning the release feed to the top of the sidebar (src/stores/feed-store.ts)
 */
export const CHANGELOG_FEED_URL = "https://feedzero.app/releases.xml";

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
