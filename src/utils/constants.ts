export const DB_NAME = "feedzero";
/**
 * Dexie schema version. Bump when adding tables or changing indexes.
 *  4 → feeds, articles, folders, meta
 *  5 → + smartFilters (user-defined virtual feeds)
 *  6 → + preferences (single-row synced user preferences)
 *
 * Dexie auto-creates new tables on open; no migration code needed
 * because each new table starts empty and existing tables are untouched.
 */
export const DB_VERSION = 6;

/** Stable id of the single row in the `preferences` table. */
export const PREFERENCES_ROW_ID = "preferences";

/** Keys for the `meta` (key/value) table. */
export const META_KEY = {
  SALT: "salt",
  /** Epoch ms of the last local preferences write; drives sync LWW. */
  PREFERENCES_UPDATED_AT: "preferencesUpdatedAt",
} as const;

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
 * Special feed ID for the cross-feed starred view. Selects every article
 * whose `starred` flag is true, ordered by `starredAt` descending. Like
 * ALL_FEEDS_ID and folder feeds, this is a virtual aggregated view —
 * articles still belong to their real feed and inherit per-article
 * provenance (favicon + feed title) in the article list.
 */
export const STARRED_FEED_ID = "starred";

/**
 * Prefix applied to a smart-filter id to form an aggregated "filter feed"
 * id (e.g. filter `abc-123` becomes the selected feed id
 * `filter:abc-123`, which represents that filter's virtual article view).
 * Mirrors FOLDER_FEED_PREFIX so the existing dispatch sites — routing,
 * sidebar selection, breadcrumbs — only learn one new branch.
 */
export const FILTER_FEED_PREFIX = "filter:";

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

/** Whether the given feed id is the starred-view virtual feed. */
export function isStarredFeedId(feedId: string): boolean {
  return feedId === STARRED_FEED_ID;
}

/** Build a smart-filter virtual feed id from a filter id. */
export function toFilterFeedId(filterId: string): string {
  return `${FILTER_FEED_PREFIX}${filterId}`;
}

/** Whether the given feed id represents a smart-filter view. */
export function isFilterFeedId(feedId: string): boolean {
  return feedId.startsWith(FILTER_FEED_PREFIX);
}

/** Extract the filter id from a filter-feed id, or null if not a filter feed. */
export function fromFilterFeedId(feedId: string): string | null {
  return isFilterFeedId(feedId)
    ? feedId.slice(FILTER_FEED_PREFIX.length)
    : null;
}

/**
 * Whether the given feed id represents an aggregated view across multiple
 * feeds (global "All items", a folder feed, the starred view, or a smart
 * filter). Used by components that must show per-article provenance
 * (feed title + favicon) when multiple feeds are displayed together.
 */
export function isAggregatedFeedId(feedId: string): boolean {
  return (
    feedId === ALL_FEEDS_ID ||
    isFolderFeedId(feedId) ||
    isStarredFeedId(feedId) ||
    isFilterFeedId(feedId)
  );
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
  GROUP_ARTICLE_FLOODS: "feedzero:group-article-floods",
  ARTICLE_SORT_MODE: "feedzero:article-sort-mode",
  DEDUPE_MIGRATION: "feedzero:dedupe-migration-v1",
  /** Most-recently-viewed feed ids, newest first. Device-local (recency
   *  is per-device and never syncs); drives the mobile drawer quick-switch
   *  dock. */
  RECENT_FEED_IDS: "feedzero:recent-feed-ids",
} as const;

/**
 * Article-flood grouping thresholds. When at least MIN_GROUP_SIZE
 * consecutive articles from the same feed (in publishedAt-desc order)
 * have adjacent gaps ≤ WINDOW_MS, the article list collapses them into
 * a single-row summary in aggregated views. Pairwise rule — long bursts
 * at 1-minute intervals stay as one group even if first→last spans much
 * more than WINDOW_MS. Grouping only applies to multi-feed views
 * (/feeds/all and folder views); single-feed views never collapse since
 * the user has already chosen to focus on that feed.
 */
export const ARTICLE_GROUPING = {
  WINDOW_MS: 10 * 60 * 1000,
  MIN_GROUP_SIZE: 5,
} as const;

/**
 * How often the app refreshes every feed in the background while it's
 * open. A timer fires on this interval; the same window doubles as the
 * staleness threshold for the focus-triggered refresh — returning to a
 * tab that's been idle longer than this pulls fresh articles instead of
 * waiting out the rest of the interval.
 */
export const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * How often an open tab re-verifies the license token against the server.
 * The boot-time check (app.tsx) and cross-tab storage events catch most
 * changes, but a tab left open for days never reboots — so a lapsed
 * subscription would keep its paid tier for the whole session. A daily
 * timer (and a focus-when-stale trigger for tabs whose timer was
 * suspended by a sleeping machine) closes that gap. Once a day is enough:
 * revocation is not time-critical, and a tighter cadence would add
 * needless server traffic for a rare event.
 */
export const LICENSE_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Group ids for the desktop ResizablePanelGroup tree.
 *
 * Two-tier model:
 *
 *   OUTER group (id = MAIN)          → constant topology on every route:
 *     ├─ ResizablePanel "sidebar"      [the only place sidebar width lives]
 *     └─ ResizablePanel "stage"        [a slot whose content swaps per route]
 *
 *   STAGE content (per route):
 *     /explore | /stats | (empty feeds) → single feature component
 *     default                            → INNER group (id = STAGE_INNER):
 *                                            ├─ "article-list"
 *                                            └─ "reader"
 *
 * Why a stable outer topology: react-resizable-panels keys saved layouts by
 * group id PLUS the shape of children at mount. When the children shape
 * changes, the library recomputes layout from each panel's `defaultSize` —
 * which produced a visible sidebar resize whenever the user navigated
 * between routes (Explore/Stats added/removed siblings of the sidebar).
 * Keeping the outer group's children as always [sidebar, stage] makes the
 * rule "sidebar size only changes by drag or window resize" hold by
 * construction.
 *
 * Why a separate inner group: the article-list/reader split should stay
 * independently resizable across feed navigation, and its own saved state
 * is keyed by STAGE_INNER, so it's untouched by the outer group's state.
 *
 * Historical note: PR F unified the outer group id to MAIN. That fixed the
 * id, but not the topology — children still varied per route. This refactor
 * (the "stage" model) completes that fix.
 */
export const PANEL_LAYOUT_ID = {
  MAIN: "feedzero:layout:main",
  STAGE_INNER: "feedzero:layout:stage-inner",
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
  FORMAT_VERSION: 3,
} as const;
