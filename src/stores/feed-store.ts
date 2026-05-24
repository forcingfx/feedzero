import { create } from "zustand";
import {
  getFeeds,
  getFeed,
  removeFeed as dbRemoveFeed,
  updateFeed as dbUpdateFeed,
  addFolder as dbAddFolder,
  getFolders as dbGetFolders,
  updateFolder as dbUpdateFolder,
  removeFolder as dbRemoveFolder,
  getAllArticles,
} from "../core/storage/db.ts";
import { createRule } from "../core/storage/schema.ts";
import {
  addFeedFlow,
  addPlaceholderFeed as addPlaceholderFeedCore,
  refreshFeed,
  refreshAllFeeds,
  reloadFeed,
} from "../core/feeds/feed-service.ts";
import {
  prefetchStarredArticles,
  prefetchFeedArticles,
  selectFrequentFeeds,
} from "../core/extractor/prefetch-service.ts";
import { useSyncStore } from "./sync-store.ts";
import { useArticleStore } from "./article-store.ts";
import { useLicenseStore } from "./license-store.ts";
import { isSelfHosted } from "../core/features/self-hosted.ts";
import { retryFailedFavicons } from "../core/favicon/favicon-cache.ts";
import { isPaidTierActive } from "../core/features/paid-tier-active.ts";
import { checkFeedQuota, quotaErrorMessage } from "../core/features/quotas.ts";
import { isFeatureEnabled, enforceFeature } from "./enforce-feature.ts";
import { persistPreferences } from "./persist-preferences.ts";
import {
  CHANGELOG_FEED_URL,
  LOCAL_STORAGE,
  isFolderFeedId,
  fromFolderFeedId,
  isAggregatedFeedId,
} from "@feedzero/core/utils/constants";
import { pickNextFolderColor } from "../lib/folder-colors.ts";
import { recordRecentFeed } from "../lib/recent-feeds.ts";
import type {
  Feed,
  Folder,
  FeedSortMode,
  Rule,
  CreateRuleInput,
} from "@feedzero/core/types";
import type { Result } from "@feedzero/core/utils/result";
import { ok, err } from "@feedzero/core/utils/result";

/**
 * `addFeed` result. Result-shaped plus an optional `reason` on the err
 * branch so call sites can distinguish failure classes: quota refusal
 * (route the user to upgrade), recoverable fetch failure (import flow
 * can create a placeholder), or unflagged (generic). Stays a structural
 * superset of `Result<void>` so existing readers of `.ok` / `.error`
 * continue to compile without change.
 */
export type AddFeedResult =
  | { ok: true; value: void }
  | {
      ok: false;
      error: string;
      reason?: "free-quota-exceeded" | "fetch-failure";
    };

/** Whether a feed is the official FeedZero release notes feed. */
function isReleaseFeed(feed: Feed): boolean {
  return feed.url === CHANGELOG_FEED_URL;
}

/** Sort feeds: release notes first, then alphabetical by title. */
function sortFeeds(feeds: Feed[]): Feed[] {
  return [...feeds].sort((a, b) => {
    const aIsRelease = isReleaseFeed(a);
    const bIsRelease = isReleaseFeed(b);
    if (aIsRelease && !bIsRelease) return -1;
    if (!aIsRelease && bIsRelease) return 1;
    return a.title.localeCompare(b.title);
  });
}

interface FeedStore {
  feeds: Feed[];
  folders: Folder[];
  selectedFeedId: string | null;
  isLoading: boolean;
  isRefreshingAll: boolean;
  refreshingFeedIds: Set<string>;
  /**
   * Epoch ms of the last completed refreshAll, or null if it hasn't run
   * this session. Drives the focus-staleness check in useAutoRefresh.
   */
  lastRefreshAllAt: number | null;
  error: string | null;
  feedSortMode: FeedSortMode;
  feedCustomOrder: string[];
  folderCustomOrder: string[];
  /**
   * Concrete feed ids in most-recently-viewed order, newest first.
   * Device-local (recency never syncs); drives the mobile drawer's
   * quick-switch favicon dock. Aggregated views (All / Starred / folder /
   * smart-filter) are never recorded — they have no favicon.
   */
  recentFeedIds: string[];
  /** True once loadFeeds() has resolved at least once. Used by the
   *  /feeds → /explore-vs-/feeds/all routing decision to avoid firing
   *  with an empty store before the DB is read. */
  feedsLoaded: boolean;
  loadFeeds: () => Promise<void>;
  /**
   * Subscribe to a feed. The optional `options` carry OPML-imported
   * metadata through `addFeedFlow` so the user's outline title, blurb,
   * tags, and original subscription date survive a reader migration.
   * Other call sites (Explore, Add-Feed dialog, …) can omit it.
   */
  addFeed: (
    url: string,
    options?: {
      titleOverride?: string;
      descriptionFallback?: string;
      tags?: string[];
      createdAtOverride?: number;
    },
  ) => Promise<AddFeedResult>;
  /**
   * Persist a placeholder feed for a URL whose initial fetch failed
   * (HTTP / network error). Used by bulk import so rate-limited URLs
   * aren't dropped — the user can hit refresh later to recover them.
   * Returns Result<Feed> so callers can chain folder placement.
   */
  addPlaceholderFeed: (url: string, error: string) => Promise<Result<Feed>>;
  removeFeed: (feedId: string) => Promise<void>;
  renameFeed: (feedId: string, newTitle: string) => Promise<void>;
  setFeedPreferFullText: (feedId: string, value: boolean) => Promise<void>;
  /**
   * Per-feed prefetch toggle. When enabled, the next refresh
   * pre-extracts this feed's most recent articles regardless of star
   * state. Personal+ feature; the toggle UI itself gates so this can
   * always be called.
   */
  setFeedPrefetchEnabled: (feedId: string, value: boolean) => Promise<void>;
  reloadSingleFeed: (feedId: string) => Promise<void>;
  selectFeed: (feedId: string) => void;
  /**
   * Refresh every feed. `respectBackoff` (default false) is set by the
   * auto-refresh timer so quiet feeds (consecutive 304s past the
   * backoff threshold) get skipped. Explicit user-triggered refreshes
   * (the toolbar button, the `r` keyboard shortcut) leave it false so
   * every feed is queried.
   */
  refreshAll: (options?: {
    respectBackoff?: boolean;
    intervalMs?: number;
  }) => Promise<void>;
  /**
   * Refresh only the scope currently being viewed, then reload the article
   * list so new items appear in place. The header refresh control routes
   * here so it never silently refreshes feeds the user isn't looking at:
   *  - concrete feed id     → that feed only
   *  - folder:<id>          → the folder's member feeds
   *  - all / starred / filter → every feed (these views aggregate across all)
   */
  refreshView: (feedId: string) => Promise<void>;
  refreshSingleFeed: (feedId: string) => Promise<void>;
  /**
   * Create a folder. `parentId` nests under another folder when set
   * (OPML imports preserve arbitrary depth — see {@link Folder.parentId}).
   * Caller is responsible for cycle prevention; OPML imports always
   * pass a parent that was just created in the same pass.
   */
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  updateFolderColor: (folderId: string, color: string | undefined) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
  applyAutoOrganize: (
    plan: { folderName: string; feedIds: string[] }[],
  ) => Promise<void>;
  setFeedSortMode: (mode: FeedSortMode) => void;
  reorderFeeds: (orderedIds: string[]) => void;
  reorderFolders: (orderedIds: string[]) => void;
  /** Per-folder collapse state. Missing key means "open" (the default). */
  folderOpenState: Record<string, boolean>;
  setFolderOpen: (folderId: string, open: boolean) => void;
  toggleFolderOpen: (folderId: string) => void;
  /**
   * Per-feed rule CRUD. Rules nest on Feed.rules and ride the existing
   * encrypted vault payload — no new collection. Every mutator is gated
   * on the `rules` feature (Personal+) for defense-in-depth; the UI
   * gates again via `useFeatureGate`.
   */
  addFeedRule: (
    feedId: string,
    input: CreateRuleInput,
  ) => Promise<Result<Rule>>;
  updateFeedRule: (feedId: string, rule: Rule) => Promise<Result<Rule>>;
  removeFeedRule: (feedId: string, ruleId: string) => Promise<void>;
  reorderFeedRules: (feedId: string, orderedIds: string[]) => Promise<void>;
  /**
   * When non-null, the rules-editor dialog is open against this feed.
   * Dialog mounts at the app root and reads this slice.
   */
  rulesEditorFeedId: string | null;
  openRulesEditor: (feedId: string) => void;
  closeRulesEditor: () => void;
  /**
   * Open/close state for the per-feed settings dialog. Dialog mounts
   * at the app root and reads this slice; non-null id = open against
   * that feed. Mirrors rulesEditorFeedId for shape.
   */
  feedSettingsDialogId: string | null;
  openFeedSettings: (feedId: string) => void;
  closeFeedSettings: () => void;
  /** Same shape, for the per-folder settings dialog (rename + color + delete). */
  folderSettingsDialogId: string | null;
  openFolderSettings: (folderId: string) => void;
  closeFolderSettings: () => void;
}

function readSortMode(): FeedSortMode {
  try {
    const v = localStorage.getItem(LOCAL_STORAGE.FEED_SORT_MODE);
    if (v === "name" || v === "count" || v === "custom") return v;
  } catch { /* localStorage unavailable */ }
  return "name";
}

function readJsonArray(key: string): string[] {
  try {
    const v = localStorage.getItem(key);
    if (v) return JSON.parse(v) as string[];
  } catch { /* ignore */ }
  return [];
}

function sortFoldersByName(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name));
}

function persistRecentFeedIds(ids: string[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE.RECENT_FEED_IDS, JSON.stringify(ids));
  } catch { /* localStorage unavailable */ }
}

/** True when the current session may mutate per-feed rules. */
function isRulesGateOpen(): boolean {
  return isFeatureEnabled("rules");
}

/**
 * Rewrite a feed's `rules` list, persist via dbUpdateFeed, and refresh
 * the in-memory snapshot. Shared by every rule mutator so reload + sync
 * push happen in exactly one place — the "extract a helper when the
 * same multi-step dance repeats" rule from CLAUDE.md.
 */
async function persistFeedRules(
  feedId: string,
  rewrite: (current: Rule[]) => Rule[],
  set: (
    partial: Partial<FeedStore> | ((s: FeedStore) => Partial<FeedStore>),
  ) => void,
): Promise<Result<Rule[]>> {
  const feedResult = await getFeed(feedId);
  if (!feedResult.ok) return err(feedResult.error);
  const current = feedResult.value.rules ?? [];
  const next = rewrite(current);
  await dbUpdateFeed({
    ...feedResult.value,
    rules: next,
    updatedAt: Date.now(),
  });
  await reloadFeeds(set);
  schedulePush();
  return ok(next);
}

/**
 * Reload feeds from the DB and update the store. Every mutator that
 * writes to the feeds table calls this so the in-memory snapshot stays
 * the single source of truth for the UI. Silent on DB read errors —
 * the store keeps its previous value, the next refresh tries again.
 */
async function reloadFeeds(
  set: (partial: Partial<FeedStore> | ((s: FeedStore) => Partial<FeedStore>)) => void,
): Promise<void> {
  const all = await getFeeds();
  if (all.ok) set({ feeds: sortFeeds(all.value) });
}

/**
 * Apply the per-feed results returned by `refreshAllFeeds()` to the
 * in-memory feeds list, replacing each refreshed entry with the
 * (freshness-mutated) feed object the worker carried back. Feeds not
 * present in `results` (skipped by backoff, or pre-existing rows the
 * worker didn't touch) stay at their previous in-memory state — they
 * already match the DB. Avoids the full IndexedDB re-decrypt the
 * previous `reloadFeeds` after-refresh call cost on every tick.
 */
function mergeRefreshResultsIntoStore(
  set: (partial: Partial<FeedStore> | ((s: FeedStore) => Partial<FeedStore>)) => void,
  get: () => FeedStore,
  results: Array<{ feed: Feed; newCount: number; updatedCount: number; error?: string }>,
): void {
  if (results.length === 0) return;
  const byId = new Map<string, Feed>();
  for (const result of results) {
    if (result.feed.id) byId.set(result.feed.id, result.feed);
  }
  const merged = get().feeds.map((existing) => byId.get(existing.id) ?? existing);
  set({ feeds: sortFeeds(merged) });
}

/** Same contract as reloadFeeds(), for the folders table. */
async function reloadFolders(
  set: (partial: Partial<FeedStore> | ((s: FeedStore) => Partial<FeedStore>)) => void,
): Promise<void> {
  const result = await dbGetFolders();
  if (result.ok) set({ folders: sortFoldersByName(result.value) });
}

/**
 * Resolve which feeds a scoped refresh should touch, given the id of the
 * currently-viewed list. `isFullRefresh` distinguishes the aggregated views
 * (all / starred / filter) — which span every feed and so reuse the batched
 * `refreshAllFeeds` path — from a folder or single feed, which refresh a
 * targeted subset and must not reset the all-feeds staleness clock.
 */
function resolveRefreshTargets(
  feeds: Feed[],
  feedId: string,
): { targets: Feed[]; isFullRefresh: boolean } {
  if (isFolderFeedId(feedId)) {
    const folderId = fromFolderFeedId(feedId);
    return {
      targets: feeds.filter((f) => f.folderId === folderId),
      isFullRefresh: false,
    };
  }
  if (isAggregatedFeedId(feedId)) {
    return { targets: feeds, isFullRefresh: true };
  }
  return { targets: feeds.filter((f) => f.id === feedId), isFullRefresh: false };
}

/**
 * Schedule a debounced sync push. Sync users persist; local-only users
 * see this as a no-op (sync-store guards on credentials). Use after any
 * mutation that should propagate to other devices.
 */
function schedulePush(): void {
  useSyncStore.getState().scheduleSyncPush();
}

/**
 * Kick off background full-text prefetch for starred articles. Gated on
 * the `offline-prefetch` feature so free users don't trigger network
 * activity they can't benefit from; self-hosters bypass via the standard
 * `self-hosted-bypass` precedence in `gateState`.
 *
 * Fire-and-forget so the refresh UI doesn't block on a (potentially
 * multi-second) batch of page fetches. When the batch actually persists
 * new `extractedContent`, refresh the article-store cache so the UI
 * picks it up without a manual reload.
 */
/** Default cap on how many recent articles get pre-extracted per
 *  prefetch-enabled feed. Keeps the per-refresh request burst bounded
 *  even if the user has hundreds of feeds toggled on. */
export const FEED_PREFETCH_LIMIT = 20;

/**
 * Run the prefetch passes for the given feeds. Returns a promise that
 * resolves once every pass has settled, so tests can await it. Callers
 * that don't care about completion (refreshAll) wrap with `void` so
 * the UI doesn't block on a potentially multi-second batch.
 */
/**
 * Immediately prefetch one feed's recent articles. Fired when the user
 * toggles "Prefetch full text" ON so the payoff is instant — they don't
 * have to wait for the next full refresh for `extractedContent` to
 * populate and the reader to render Full text without a fetch. Best-effort
 * and gated, identical to the refresh-time pass.
 */
async function prefetchSingleFeedNow(feedId: string): Promise<void> {
  if (!isFeatureEnabled("offline-prefetch")) return;
  try {
    const result = await prefetchFeedArticles(feedId, FEED_PREFETCH_LIMIT);
    if (result.ok && result.value.extracted > 0) {
      void useArticleStore.getState().preloadAll();
    }
  } catch {
    // Best-effort: a failed immediate prefetch just means the next
    // refresh (or on-demand extraction) handles it.
  }
}

async function schedulePrefetch(feeds: Feed[]): Promise<void> {
  if (!isFeatureEnabled("offline-prefetch")) return;

  // Two passes — starred (always-on for prefetch-gated users) and
  // per-feed (only feeds the user has explicitly opted in). The
  // article-store is refreshed once at the end if any pass actually
  // persisted new content.
  const prefetchEnabledFeeds = feeds.filter((f) => f.prefetchEnabled);

  // Prefetch is best-effort and runs on a background tick. Wrap the
  // body in try/catch so an unexpected failure (network, mock, missing
  // export in an older test fixture) degrades to "no prefetch this
  // refresh" rather than an unhandled rejection that pollutes the
  // user's session.
  try {
    let anyExtracted = false;
    const starred = await prefetchStarredArticles();
    if (starred.ok && starred.value.extracted > 0) anyExtracted = true;

    // Compose the per-feed list: explicit toggle + the frequency
    // heuristic, deduplicated. Read counts come from Article.readAt
    // which never leaves the encrypted vault, so this stays private.
    const idsToPrefetch = new Set<string>();
    for (const feed of prefetchEnabledFeeds) idsToPrefetch.add(feed.id);

    const articlesResult = await getAllArticles();
    if (articlesResult.ok) {
      for (const feedId of selectFrequentFeeds(articlesResult.value)) {
        idsToPrefetch.add(feedId);
      }
    }

    for (const feedId of idsToPrefetch) {
      const result = await prefetchFeedArticles(feedId, FEED_PREFETCH_LIMIT);
      if (result.ok && result.value.extracted > 0) anyExtracted = true;
    }

    if (anyExtracted) {
      void useArticleStore.getState().preloadAll();
    }
  } catch {
    // Swallow — prefetch failing is non-fatal. The next refresh tries again.
  }
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  feeds: [],
  folders: [],
  selectedFeedId: null,
  isLoading: false,
  isRefreshingAll: false,
  refreshingFeedIds: new Set(),
  lastRefreshAllAt: null,
  error: null,
  feedSortMode: readSortMode(),
  feedCustomOrder: readJsonArray(LOCAL_STORAGE.FEED_CUSTOM_ORDER),
  folderCustomOrder: readJsonArray(LOCAL_STORAGE.FOLDER_CUSTOM_ORDER),
  recentFeedIds: readJsonArray(LOCAL_STORAGE.RECENT_FEED_IDS),
  folderOpenState: {},
  feedsLoaded: false,
  rulesEditorFeedId: null,
  openRulesEditor: (feedId) => set({ rulesEditorFeedId: feedId }),
  closeRulesEditor: () => set({ rulesEditorFeedId: null }),
  feedSettingsDialogId: null,
  openFeedSettings: (feedId) => set({ feedSettingsDialogId: feedId }),
  closeFeedSettings: () => set({ feedSettingsDialogId: null }),
  folderSettingsDialogId: null,
  openFolderSettings: (folderId) => set({ folderSettingsDialogId: folderId }),
  closeFolderSettings: () => set({ folderSettingsDialogId: null }),

  loadFeeds: async () => {
    const [feedsResult, foldersResult] = await Promise.all([getFeeds(), dbGetFolders()]);
    set({
      feeds: feedsResult.ok ? sortFeeds(feedsResult.value) : [],
      folders: foldersResult.ok ? sortFoldersByName(foldersResult.value) : [],
      error: feedsResult.ok ? null : feedsResult.error,
      feedsLoaded: true,
    });
  },

  addFeed: async (url, options) => {
    // Free hosted users are capped at 50 feed subscriptions (ADR 013).
    // Personal/Pro and self-hosted bypass. Check BEFORE touching the
    // ingestion pipeline so we don't half-add a feed then fail late.
    const quota = checkFeedQuota({
      currentCount: get().feeds.length,
      tier: useLicenseStore.getState().tier,
      isSelfHosted: isSelfHosted(),
      paidTierActive: isPaidTierActive(),
    });
    if (!quota.ok) {
      const message = quotaErrorMessage(quota);
      set({ error: message });
      return {
        ok: false,
        error: message,
        reason: "free-quota-exceeded",
      } as const;
    }

    set({ isLoading: true, error: null });
    // Resolve the bridges gate here (store layer owns license/self-host
    // state) and pass it down as a plain boolean — core stays store-agnostic.
    const bridgesEnabled = isFeatureEnabled("bridges");
    const result = await addFeedFlow(url, {
      bridgesEnabled,
      titleOverride: options?.titleOverride,
      descriptionFallback: options?.descriptionFallback,
      tags: options?.tags,
      createdAtOverride: options?.createdAtOverride,
    });
    if (!result.ok) {
      set({ isLoading: false, error: result.error });
      // Preserve the reason discriminator so import-side callers can
      // distinguish recoverable fetch failures (placeholder candidate)
      // from permanent ones (parse / discovery / duplicate).
      return result.reason
        ? ({ ok: false, error: result.error, reason: result.reason } as const)
        : ({ ok: false, error: result.error } as const);
    }
    // Push the ingested articles into the article-store immediately so the
    // sidebar badge reflects the true unread count without waiting for the
    // user to click the feed. The article-store is the single source of
    // truth; adding a feed is an article-ingestion event, so the two stores
    // must update in the same transaction.
    useArticleStore.setState((s) => ({
      articlesByFeedId: {
        ...s.articlesByFeedId,
        [result.value.feed.id]: result.value.articles,
      },
    }));
    await reloadFeeds(set);
    set({ selectedFeedId: result.value.feed.id, isLoading: false });
    schedulePush();
    return { ok: true, value: undefined } as const;
  },

  addPlaceholderFeed: async (url, error) => {
    const result = await addPlaceholderFeedCore(url, error);
    if (!result.ok) return result;
    await reloadFeeds(set);
    schedulePush();
    return result;
  },

  removeFeed: async (feedId) => {
    const result = await dbRemoveFeed(feedId);
    if (!result.ok) return;
    await reloadFeeds(set);
    const currentSelection = get().selectedFeedId;
    if (currentSelection === feedId) set({ selectedFeedId: null });
    const recent = get().recentFeedIds.filter((id) => id !== feedId);
    if (recent.length !== get().recentFeedIds.length) {
      persistRecentFeedIds(recent);
      set({ recentFeedIds: recent });
    }
    schedulePush();
  },

  renameFeed: async (feedId, newTitle) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    await dbUpdateFeed({ ...feedResult.value, title: newTitle, updatedAt: Date.now() });
    await reloadFeeds(set);
    schedulePush();
  },

  setFeedPreferFullText: async (feedId, value) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    await dbUpdateFeed({ ...feedResult.value, preferFullText: value, updatedAt: Date.now() });
    await reloadFeeds(set);
    schedulePush();
  },

  setFeedPrefetchEnabled: async (feedId, value) => {
    // Defense-in-depth: the UI disables this toggle for gated users, but
    // guard the store too so a programmatic caller can't enable a paid
    // capability. Disabling is always allowed (turning off an inert flag
    // after a downgrade). Silent — the UI owns the upgrade messaging.
    if (value && !isFeatureEnabled("offline-prefetch")) return;
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    await dbUpdateFeed({
      ...feedResult.value,
      prefetchEnabled: value,
      updatedAt: Date.now(),
    });
    await reloadFeeds(set);
    schedulePush();
    // Enabling should pay off now, not on the next refresh.
    if (value) void prefetchSingleFeedNow(feedId);
  },

  selectFeed: (feedId) => {
    set({ selectedFeedId: feedId });
    // Record concrete feeds for the quick-switch dock; aggregated views
    // have no favicon to dock. selectFeed is the single chokepoint the
    // URL-sync effect routes every feed view through, so this captures
    // recency without a separate tracking call site.
    if (isAggregatedFeedId(feedId)) return;
    const recent = recordRecentFeed(get().recentFeedIds, feedId);
    persistRecentFeedIds(recent);
    set({ recentFeedIds: recent });
  },

  refreshAll: async (options = {}) => {
    if (get().isRefreshingAll) return;
    set({ isRefreshingAll: true });
    // A refresh is the user's "try again" — give favicons that failed during a
    // transient outage (e.g. a self-hosted server overwhelmed by a bulk import)
    // another chance instead of waiting out the 24h failure TTL. See issue #117.
    retryFailedFavicons();
    try {
      const syncStore = useSyncStore.getState();
      if (syncStore.credentials) {
        await syncStore.pull();
        // Pull may have added/removed rows; full reload is the cheapest
        // way to reconcile.
        await reloadFeeds(set);
      }
      const refreshResult = await refreshAllFeeds(
        options.respectBackoff && options.intervalMs !== undefined
          ? { respectBackoffWithDefaultMs: options.intervalMs }
          : {},
      );
      // Merge the per-feed freshness from the refresh results into the
      // in-memory store, skipping a second full DB read (refresh-efficiency
      // follow-up D). On a refresh-level failure we don't have per-feed
      // granularity, so fall back to the full reload to keep the store
      // honest.
      const results = refreshResult?.ok ? refreshResult.value?.results : null;
      if (results) {
        mergeRefreshResultsIntoStore(set, get, results);
      } else {
        await reloadFeeds(set);
      }
      schedulePush();
    } finally {
      set({ isRefreshingAll: false, lastRefreshAllAt: Date.now() });
    }
    // Fire-and-forget — refreshAll returns once the feeds are fresh,
    // prefetch continues in the background.
    void schedulePrefetch(get().feeds);
  },

  refreshView: async (feedId) => {
    if (get().isRefreshingAll) return;
    set({ isRefreshingAll: true });
    retryFailedFavicons();
    const { targets, isFullRefresh } = resolveRefreshTargets(
      get().feeds,
      feedId,
    );
    try {
      if (isFullRefresh) {
        const syncStore = useSyncStore.getState();
        if (syncStore.credentials) {
          await syncStore.pull();
          await reloadFeeds(set);
        }
        await refreshAllFeeds();
      } else {
        await Promise.all(targets.map((feed) => refreshFeed(feed)));
      }
      await reloadFeeds(set);
      // Reload the article store so the freshly-fetched items show up in the
      // open list without the user re-navigating. preloadAll keeps the other
      // views coherent; loadArticles re-derives the visible list for this one.
      const articleStore = useArticleStore.getState();
      await articleStore.preloadAll();
      await articleStore.loadArticles(feedId);
      schedulePush();
    } finally {
      // A scoped refresh leaves other feeds untouched, so it must not stamp
      // lastRefreshAllAt — that clock gates the background full auto-refresh.
      set(
        isFullRefresh
          ? { isRefreshingAll: false, lastRefreshAllAt: Date.now() }
          : { isRefreshingAll: false },
      );
    }
    void schedulePrefetch(get().feeds);
  },

  reloadSingleFeed: async (feedId) => {
    if (get().refreshingFeedIds.has(feedId)) return;
    const ids = new Set(get().refreshingFeedIds);
    ids.add(feedId);
    set({ refreshingFeedIds: ids });
    try {
      const feedResult = await getFeed(feedId);
      if (!feedResult.ok) return;
      const feed = feedResult.value;

      await reloadFeed(feed);
      const { loadArticles, preloadAll } = useArticleStore.getState();
      await preloadAll();
      const selectedFeedId = get().selectedFeedId;
      if (selectedFeedId) await loadArticles(selectedFeedId);
    } finally {
      const ids = new Set(get().refreshingFeedIds);
      ids.delete(feedId);
      set({ refreshingFeedIds: ids });
    }
    schedulePush();
  },

  refreshSingleFeed: async (feedId) => {
    if (get().refreshingFeedIds.has(feedId)) return;
    const ids = new Set(get().refreshingFeedIds);
    ids.add(feedId);
    set({ refreshingFeedIds: ids });
    try {
      const feedResult = await getFeed(feedId);
      if (!feedResult.ok) return;
      await refreshFeed(feedResult.value);
      await reloadFeeds(set);
    } finally {
      const ids = new Set(get().refreshingFeedIds);
      ids.delete(feedId);
      set({ refreshingFeedIds: ids });
    }
  },

  createFolder: async (name, parentId) => {
    const color = pickNextFolderColor(get().folders.map((f) => f.color));
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      color,
      createdAt: Date.now(),
    };
    if (parentId) folder.parentId = parentId;
    await dbAddFolder(folder);
    await reloadFolders(set);
    schedulePush();
  },

  renameFolder: async (folderId, name) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    await dbUpdateFolder({ ...folder, name });
    await reloadFolders(set);
    schedulePush();
  },

  updateFolderColor: async (folderId, color) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    await dbUpdateFolder({ ...folder, color });
    await reloadFolders(set);
    schedulePush();
  },

  deleteFolder: async (folderId) => {
    // Unfile all feeds in this folder, then drop the folder itself.
    const feeds = get().feeds.filter((f) => f.folderId === folderId);
    for (const feed of feeds) {
      await dbUpdateFeed({ ...feed, folderId: undefined, updatedAt: Date.now() });
    }
    await dbRemoveFolder(folderId);
    await Promise.all([reloadFeeds(set), reloadFolders(set)]);
    schedulePush();
  },

  moveFeedToFolder: async (feedId, folderId) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    await dbUpdateFeed({ ...feedResult.value, folderId: folderId ?? undefined, updatedAt: Date.now() });
    await reloadFeeds(set);
    schedulePush();
  },

  setFeedSortMode: (mode) => {
    set({ feedSortMode: mode });
    persistPreferences({ feedSortMode: mode });
  },

  reorderFeeds: (orderedIds) => {
    set({ feedCustomOrder: orderedIds });
    persistPreferences({ feedCustomOrder: orderedIds });
  },

  reorderFolders: (orderedIds) => {
    set({ folderCustomOrder: orderedIds });
    persistPreferences({ folderCustomOrder: orderedIds });
  },

  setFolderOpen: (folderId, open) =>
    set((s) => ({ folderOpenState: { ...s.folderOpenState, [folderId]: open } })),

  toggleFolderOpen: (folderId) =>
    set((s) => {
      const current = s.folderOpenState[folderId];
      // undefined is treated as open (matches the previous useState(true)
      // default in FolderItem), so the first toggle closes the folder.
      const next = current === undefined ? false : !current;
      return { folderOpenState: { ...s.folderOpenState, [folderId]: next } };
    }),

  /**
   * Bulk-apply an auto-organize plan: for each entry with feeds, create a
   * folder (or reuse one with the same case-insensitive name) and move the
   * listed feeds into it. Empty entries are skipped — we don't litter the
   * sidebar with unused folders. One sync push at the end keeps writes cheap.
   */
  applyAutoOrganize: async (plan) => {
    // Defense-in-depth: even when the UI thinks the user is paid, gate the
    // store action so programmatic callers (future shortcuts, scripts) cannot
    // bypass the honor-system check. UI handles its own messaging; the toast
    // here covers the edge case where state diverges.
    if (!enforceFeature("auto-organize")) return;

    const nonEmpty = plan.filter((p) => p.feedIds.length > 0);
    if (nonEmpty.length === 0) return;

    // Map normalized name → folderId so reuse is case-insensitive.
    const existingByName = new Map(
      get().folders.map((f) => [f.name.toLowerCase(), f.id]),
    );
    const folderIdByPlan = new Map<string, string>();

    // Track colors as we go so successive new folders get distinct ones
    // (the in-memory store hasn't been refreshed yet within this loop).
    const usedColors: (string | undefined)[] = get().folders.map((f) => f.color);
    for (const entry of nonEmpty) {
      const key = entry.folderName.toLowerCase();
      const existing = existingByName.get(key);
      if (existing) {
        folderIdByPlan.set(entry.folderName, existing);
        continue;
      }
      const color = pickNextFolderColor(usedColors);
      usedColors.push(color);
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: entry.folderName,
        color,
        createdAt: Date.now(),
      };
      await dbAddFolder(folder);
      folderIdByPlan.set(entry.folderName, folder.id);
      existingByName.set(key, folder.id);
    }

    // Refresh folders state once after all creates.
    await reloadFolders(set);

    // Move every feed into its assigned folder.
    for (const entry of nonEmpty) {
      const folderId = folderIdByPlan.get(entry.folderName);
      if (!folderId) continue;
      for (const feedId of entry.feedIds) {
        const feedResult = await getFeed(feedId);
        if (!feedResult.ok) continue;
        await dbUpdateFeed({
          ...feedResult.value,
          folderId,
          updatedAt: Date.now(),
        });
      }
    }

    await reloadFeeds(set);
    schedulePush();
  },

  addFeedRule: async (feedId, input) => {
    if (!enforceFeature("rules")) return err("Rules require the Personal tier");
    const created = createRule(input);
    if (!created.ok) return err(created.error);

    const persisted = await persistFeedRules(
      feedId,
      (current) => [...current, created.value],
      set,
    );
    if (!persisted.ok) return err(persisted.error);
    return ok(created.value);
  },

  updateFeedRule: async (feedId, rule) => {
    if (!enforceFeature("rules")) return err("Rules require the Personal tier");
    let found = false;
    const result = await persistFeedRules(
      feedId,
      (current) =>
        current.map((r) => {
          if (r.id !== rule.id) return r;
          found = true;
          return { ...rule, updatedAt: Date.now() };
        }),
      set,
    );
    if (!result.ok) return err(result.error);
    if (!found) return err(`Rule ${rule.id} not found on feed ${feedId}`);
    return ok({ ...rule, updatedAt: Date.now() });
  },

  removeFeedRule: async (feedId, ruleId) => {
    if (!isRulesGateOpen()) return;
    await persistFeedRules(
      feedId,
      (current) => current.filter((r) => r.id !== ruleId),
      set,
    );
  },

  reorderFeedRules: async (feedId, orderedIds) => {
    if (!isRulesGateOpen()) return;
    await persistFeedRules(
      feedId,
      (current) => {
        const byId = new Map(current.map((r) => [r.id, r]));
        const reordered: Rule[] = [];
        for (const id of orderedIds) {
          const r = byId.get(id);
          if (r) reordered.push(r);
        }
        return reordered;
      },
      set,
    );
  },
}));

/**
 * Selector that returns a map of feedId to Feed for efficient lookups.
 */
export function selectFeedsById(
  state: Pick<FeedStore, "feeds">,
): Record<string, Feed> {
  return Object.fromEntries(state.feeds.map((f) => [f.id, f]));
}
