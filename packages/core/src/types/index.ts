export interface Feed {
  id: string;
  url: string;
  title: string;
  description: string;
  siteUrl: string;
  /** Folder this feed belongs to. Null/undefined = unfiled (top level). */
  folderId?: string;
  /** When true, the reader opens articles from this feed in "Full text" view by default. */
  preferFullText?: boolean;
  /**
   * When true, the feed's most recent articles are pre-extracted into
   * `Article.extractedContent` during background refresh — matches the
   * starred-prefetch behaviour for every new item from this feed, not
   * just the ones the user has starred. Storage cost: one extracted
   * HTML body per article, encrypted at rest like everything else.
   */
  prefetchEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Unix epoch ms of the last refresh attempt, success or failure. */
  lastFetchedAt?: number;
  /** Unix epoch ms of the last refresh attempt that returned HTTP 2xx. */
  lastSuccessfulFetchAt?: number;
  /**
   * Most-recent refresh error message, set by `persistFreshness` in
   * `feed-service.ts`. Cleared on every successful refresh. Set on
   * placeholder feeds added by bulk import when the initial fetch failed
   * (HTTP / network error) — refresh recovers the feed and clears the
   * field. A non-empty `lastError` with `lastSuccessfulFetchAt === undefined`
   * is the placeholder signal the sidebar uses to render a red error icon.
   */
  lastError?: string;
  /**
   * Per-feed auto-action rules evaluated on ingest. Each rule's
   * condition is matched against newly-fetched articles; matching
   * articles get every action in `rule.actions` applied before
   * persistence. Rules are scoped to this feed only — global rules
   * may be layered later by composing additional lists into the same
   * `applyRules` call.
   */
  rules?: Rule[];
  /**
   * Most-recent `ETag` returned by the publisher on a 2xx fetch. Replayed
   * on the next refresh as `If-None-Match`; a 304 short-circuits the
   * download. These are public HTTP cache validators for a public feed
   * URL — they betray nothing about the user's read state — so they
   * ride in the encrypted vault alongside the other feed metadata.
   */
  etag?: string;
  /** Most-recent `Last-Modified` returned by the publisher; see {@link Feed.etag}. */
  lastModified?: string;
  /**
   * Number of consecutive 304 Not Modified responses the publisher has
   * returned. Used by the bulk auto-refresh path to stretch the effective
   * refresh interval for feeds that publish infrequently — see
   * `effectiveRefreshIntervalMs` in `src/core/feeds/refresh-backoff.ts`.
   * Cleared on any non-304 response.
   */
  consecutive304Count?: number;
  /**
   * Free-form tags. Populated from OPML `outline[category="a,b"]` on
   * import (comma-split, trimmed, deduped) and round-tripped on export.
   * Honor-system organization concept: filters can scope by tag via the
   * `tag` Condition variant; the sidebar doesn't render a top-level
   * "browse by tag" surface yet. Empty array is the absence value;
   * older vaults without this field continue to work (treated as []).
   */
  tags?: string[];
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  /**
   * Parent folder id when this folder is nested. Undefined / missing
   * means "top level". OPML imports preserve arbitrary depth (NetNewsWire
   * and Reeder exports routinely go 2–3 deep, e.g. Tech > Frontend >
   * React); the sidebar renders recursively. Older vaults without this
   * field continue to work (every folder is implicitly top-level).
   *
   * Cycle prevention is the responsibility of mutators —
   * `moveFolderToParent` rejects an assignment whose new parent is a
   * descendant of the moved folder. See `src/core/feeds/folder-tree.ts`.
   */
  parentId?: string;
}

export interface Article {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  link: string;
  content: string;
  summary: string;
  author: string;
  publishedAt: number;
  read: boolean;
  createdAt: number;
  /** User has flagged this article as worth keeping. Drives the starred view. */
  starred?: boolean;
  /** Unix epoch ms of the most recent star action; used to sort the starred view. */
  starredAt?: number;
  /**
   * Hidden from default article lists. Set by a rule's `mute` action on
   * ingest, surfaceable via a "Show muted" affordance. Muted is distinct
   * from `read`: read articles still appear in read-views, muted articles
   * don't appear anywhere by default.
   */
  muted?: boolean;
  /**
   * Per-article folder override set by a `route-to-folder` rule action.
   * When absent, the article inherits its feed's `folderId`. When present,
   * the article appears under this folder regardless of its feed's folder.
   */
  folderId?: string;
  /**
   * Unix epoch ms when the user most recently opened / read this
   * article. Drives the frequency heuristic that auto-prefetches
   * feeds the user reads often, without requiring an explicit toggle.
   * Set in `selectArticle` on the auto-mark-read delay; never set
   * server-side.
   */
  readAt?: number;
  /**
   * Sanitized full-text HTML extracted from `link` and persisted for offline
   * reading. Populated by the background prefetch service for starred
   * articles; rides through the encrypted vault to other devices.
   */
  extractedContent?: string;
  /** Unix epoch ms when extractedContent was captured. */
  extractedAt?: number;
}

export interface CreateFeedInput {
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
  /** See {@link Feed.tags}. Empty/undefined → no tags. */
  tags?: string[];
  /**
   * Override the default `Date.now()` stamp. Used by OPML import to
   * preserve `outline[created="…"]` so a feed the user subscribed to in
   * 2014 doesn't appear "added today" on every migration. Must be a
   * positive Unix-epoch ms timestamp; otherwise the factory falls back
   * to `Date.now()` rather than persisting a nonsensical value.
   */
  createdAt?: number;
}

export type FeedSortMode = "name" | "count" | "custom";

/**
 * How the article list is ordered. Persisted to localStorage as a user
 * preference. "newest" preserves the historical default; "unread-first"
 * groups unread before read, then newest-first within each group.
 */
export type ArticleSortMode = "newest" | "oldest" | "unread-first";

export const ARTICLE_SORT_MODES: readonly ArticleSortMode[] = [
  "newest",
  "oldest",
  "unread-first",
] as const;

/**
 * User preferences consolidated into a single synced, encrypted-at-rest
 * record (the `preferences` Dexie table; rides through the vault as
 * VaultData v3+). Replaces the loose, unencrypted `localStorage` keys that
 * previously stranded these settings on one device. Conflict resolution is
 * timestamp-gated last-write-wins via VaultData.preferencesUpdatedAt — see
 * `mergeVaults` and `sync-store.pull`.
 *
 * `theme` is declared here but not yet wired (next-themes bridge lands in a
 * follow-up PR); until then it stays undefined.
 */
export interface UserPreferences {
  feedSortMode: FeedSortMode;
  feedCustomOrder: string[];
  folderCustomOrder: string[];
  articleSortMode: ArticleSortMode;
  groupArticleFloods: boolean;
  theme?: "light" | "dark" | "system";
}

/** Baseline preferences used before hydration and for first-run defaults. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  feedSortMode: "name",
  feedCustomOrder: [],
  folderCustomOrder: [],
  articleSortMode: "newest",
  groupArticleFloods: true,
  // "system" honors the OS color-scheme preference. The ThemeBridge bridges
  // this value to next-themes after preferences hydrate; first paint comes
  // from next-themes' own localStorage (its <head> script runs before
  // React) so this default only takes effect on a brand-new install.
  theme: "system",
};

export interface CreateArticleInput {
  feedId: string;
  title: string;
  link: string;
  guid?: string;
  content?: string;
  summary?: string;
  author?: string;
  publishedAt?: number | null;
}

/**
 * User-defined "smart playlist" for articles. Pulls articles from every
 * loaded feed where `rule` evaluates true. Live — no materialization.
 *
 * Storage: encrypted at rest in the `smartFilters` Dexie table; rides
 * through the encrypted vault to other devices (VaultData v3+).
 */
export interface SmartFilter {
  id: string;
  name: string;
  /** Lucide-react icon name; defaults to "Filter" when omitted. */
  icon?: string;
  /** Optional Tailwind color token for the sidebar accent. */
  color?: string;
  rule: ConditionGroup;
  /** Per-filter sort override; falls back to the user's article sort mode. */
  sortMode?: ArticleSortMode;
  /** Optional cap on returned articles. */
  limit?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Recursive boolean composition for smart filters.
 * `match: "all"` = AND, `match: "any"` = OR. `not: true` negates the
 * whole group, letting users express "none of these match".
 */
export interface ConditionGroup {
  kind: "group";
  match: "all" | "any";
  not?: boolean;
  children: Array<Condition | ConditionGroup>;
}

/**
 * Discriminated union over every supported filter condition.
 *
 * Text operators are case-insensitive. `matches` is an anchored regex
 * — invalid patterns are rejected by `validation.ts` at edit time,
 * never persisted.
 *
 * `feed` / `folder` ids reference the user's own data and must stay in
 * sync with the local stores; the evaluator gracefully treats unknown
 * ids as "no match" so a deleted feed never freezes a filter.
 *
 * `filterRef` lets one filter reference another by id. The evaluator
 * passes a `visiting: Set<string>` cycle guard — a self-loop or
 * mutual reference resolves to `false` rather than infinite recursion.
 */
export type Condition =
  | { kind: "title";        op: "contains" | "not-contains" | "equals" | "matches"; value: string }
  | { kind: "author";       op: "contains" | "not-contains" | "equals"; value: string }
  | { kind: "content";      op: "contains" | "not-contains" | "matches"; value: string }
  | { kind: "feed";         op: "in" | "not-in"; value: string[] }
  | { kind: "folder";       op: "in" | "not-in"; value: string[] }
  | { kind: "tag";          op: "in" | "not-in"; value: string[] }
  | { kind: "publishedAt";  op: "in-last-days" | "in-last-hours" | "before" | "after" | "between"; value: number | [number, number] }
  | { kind: "read";         op: "is"; value: boolean }
  | { kind: "starred";      op: "is"; value: boolean }
  | { kind: "extracted";    op: "is"; value: boolean }
  | { kind: "filterRef";    op: "matches"; value: string };

export interface CreateSmartFilterInput {
  name: string;
  rule: ConditionGroup;
  icon?: string;
  color?: string;
  sortMode?: ArticleSortMode;
  limit?: number;
}

/**
 * A side-effecting action a `Rule` applies to a matching article on
 * ingest. Discriminated on `kind` so adding a new action forces an
 * exhaustive update to `applyRules`. Reversible state — never delete.
 */
export type RuleAction =
  | { kind: "mark-read" }
  | { kind: "star" }
  | { kind: "mute" }
  | { kind: "route-to-folder"; folderId: string };

/**
 * Per-feed auto-action rule. Stored nested on `Feed.rules` and synced
 * through the same vault payload as the feed itself — no new collection
 * required. Rules evaluate on `refreshFeed` ingest, before articles
 * are persisted; they may also be re-applied to existing articles via
 * an explicit "Apply to existing" action in the editor.
 */
export interface Rule {
  id: string;
  /** Human-readable label shown in the rule editor list. */
  name: string;
  /** Paused rules persist but do not run. Saves users from deleting + recreating. */
  enabled: boolean;
  /** Same boolean AST as smart filters — reuses `evaluateGroup`. */
  condition: ConditionGroup;
  /** Applied in order; every action in the list runs when the rule matches. */
  actions: RuleAction[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateRuleInput {
  name: string;
  condition: ConditionGroup;
  actions: RuleAction[];
  enabled?: boolean;
}
