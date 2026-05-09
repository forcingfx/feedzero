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
 * Prefix applied to a folder id to form an aggregated "folder feed" id.
 * e.g. folder `abc-123` becomes the selected feed id `folder:abc-123`,
 * which represents the aggregated stream of every feed in that folder.
 */
export const FOLDER_FEED_PREFIX = "folder:";

/** Build a folder-aggregated feed id from a folder id. */
export function toFolderFeedId(folderId: string): string {
  return `${FOLDER_FEED_PREFIX}${folderId}`;
}

/** Whether the given feed id represents a folder-aggregated view. */
export function isFolderFeedId(feedId: string): boolean {
  return feedId.startsWith(FOLDER_FEED_PREFIX);
}

/** Extract the folder id from a folder-feed id, or null if not a folder feed. */
export function fromFolderFeedId(feedId: string): string | null {
  return isFolderFeedId(feedId)
    ? feedId.slice(FOLDER_FEED_PREFIX.length)
    : null;
}

/**
 * Whether the given feed id represents an aggregated view across multiple
 * feeds (global "All items" or a folder feed). Used by components that
 * must show per-article provenance (feed title + favicon) when multiple
 * feeds are displayed together.
 */
export function isAggregatedFeedId(feedId: string): boolean {
  return feedId === ALL_FEEDS_ID || isFolderFeedId(feedId);
}

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
  FEED_SORT_MODE: "feedzero:feed-sort-mode",
  FEED_CUSTOM_ORDER: "feedzero:feed-custom-order",
  FOLDER_CUSTOM_ORDER: "feedzero:folder-custom-order",
  AUTO_ORGANIZE_DISMISSED_COUNT: "feedzero:auto-organize-dismissed-count",
} as const;

/**
 * Group ids for the desktop ResizablePanelGroup. Each layout shape gets its own
 * id so react-resizable-panels persists widths independently — switching from
 * the 3-panel feeds layout to the 2-panel explore/stats layout must not
 * clobber the user's preferred sidebar/article-list/reader proportions.
 */
export const PANEL_LAYOUT_ID = {
  /** 3-panel: sidebar + article list + reader. */
  FEEDS: "feedzero:layout:feeds",
  /** 2-panel: sidebar + single content area (explore or stats). */
  SINGLE: "feedzero:layout:single",
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
