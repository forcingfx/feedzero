import { create } from "zustand";
import {
  getArticles,
  getAllArticles,
  updateArticle,
} from "../core/storage/db.ts";
import { useSyncStore } from "./sync-store.ts";
import { useFeedStore } from "./feed-store.ts";
import {
  ALL_FEEDS_ID,
  LOCAL_STORAGE,
  isFolderFeedId,
  isAggregatedFeedId,
  isStarredFeedId,
  isFilterFeedId,
  fromFolderFeedId,
  fromFilterFeedId,
} from "@feedzero/core/utils/constants";
import type { Article, ArticleSortMode } from "@feedzero/core/types";
import { ARTICLE_SORT_MODES } from "@feedzero/core/types";
import { useSmartFilterStore } from "./smart-filter-store.ts";
import { persistPreferences } from "./persist-preferences.ts";
import {
  buildContext,
  evaluateFilter,
} from "../core/filters/evaluator.ts";

/**
 * `articlesByFeedId` is the single source of truth for loaded article data,
 * keyed by the real (non-aggregated) feed id. Every UI fact derived from
 * article state — sidebar unread badges, aggregated feed views, mark-read
 * mutations — reads from this map. No separate counter, no parallel cache.
 *
 * Keeping this inside store state (rather than a module-level Map) means:
 * - Components subscribe and re-render automatically when the cache changes.
 * - There is no hand-maintained protocol between a hidden global and a stored
 *   derivation — a class of coherence bugs (e.g. "loadArticles forgot to
 *   update unreadCounts", "mark-read leaked past a folder view") becomes
 *   structurally impossible.
 * - Tests reset the cache by resetting store state, no custom helper required.
 */
interface ArticleStore {
  /** Source of truth: every loaded article, keyed by owning feed id. */
  articlesByFeedId: Record<string, Article[]>;
  /** Currently visible list for the active feed / aggregated view. */
  articles: Article[];
  selectedArticle: Article | null;
  isLoading: boolean;
  /** User-chosen sort order for the visible article list; persisted. */
  articleSortMode: ArticleSortMode;
  /**
   * When false (default), muted articles are hidden from default views
   * (ALL_FEEDS, specific feed, folder). When true, they reappear in
   * those views. Starred and smart-filter views always show muted
   * articles regardless — those are user-explicit selections.
   */
  showMuted: boolean;
  /** Preload every article into the store; used on startup and on refresh. */
  preloadAll: () => Promise<void>;
  loadArticles: (feedId: string) => Promise<void>;
  selectArticle: (article: Article | null) => Promise<void>;
  markAsRead: (articleId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /**
   * Flip an article's `starred` flag and sync the change.
   * Sets `starredAt` when starring; clears it when unstarring so the
   * starred view's "most-recent first" sort is honest.
   */
  toggleStar: (articleId: string) => Promise<void>;
  /** Switch sort order; re-derives the visible list immediately. No-op on unknown modes. */
  setArticleSortMode: (mode: ArticleSortMode) => void;
  /**
   * Toggle the "Show muted" affordance. Re-derives the visible list
   * immediately so the UI reflects the change without another action.
   * Active feed id is recovered from feed-store rather than tracked here.
   */
  setShowMuted: (value: boolean) => void;
}

/** Delay before an opened article is marked as read (ms). */
const MARK_AS_READ_DELAY = 1000;
let markAsReadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Derived unread count for a single feed. Pure function over store state —
 * guaranteed to reflect the current article data because there is nothing
 * else to keep in sync.
 */
export function selectUnreadCount(
  state: Pick<ArticleStore, "articlesByFeedId">,
  feedId: string,
): number {
  const articles = state.articlesByFeedId[feedId];
  if (!articles) return 0;
  let count = 0;
  for (const a of articles) if (!a.read) count++;
  return count;
}

/**
 * Derived count of muted articles for a single feed. Pure function over
 * store state — drives the "Show muted (N)" affordance in the article
 * list footer. Muted articles are hidden by default but still counted
 * here so the user can tell when their rules have caught something.
 */
export function selectMutedCount(
  state: Pick<ArticleStore, "articlesByFeedId">,
  feedId: string,
): number {
  const articles = state.articlesByFeedId[feedId];
  if (!articles) return 0;
  let count = 0;
  for (const a of articles) if (a.muted) count++;
  return count;
}

/**
 * Sort articles according to the current user-chosen mode.
 * "newest" — publishedAt descending (the historical default).
 * "oldest" — publishedAt ascending.
 * "unread-first" — unread group first, read group second; newest-first within each.
 */
function sortArticles(articles: Article[], mode: ArticleSortMode = "newest"): Article[] {
  const newestFirst = (a: Article, b: Article) =>
    (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
  if (mode === "oldest") {
    return [...articles].sort(
      (a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0),
    );
  }
  if (mode === "unread-first") {
    return [...articles].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return newestFirst(a, b);
    });
  }
  return [...articles].sort(newestFirst);
}

/** Read the persisted sort mode, or fall back to "newest" if absent / invalid. */
function loadPersistedSortMode(): ArticleSortMode {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_STORAGE.ARTICLE_SORT_MODE);
    if (raw && (ARTICLE_SORT_MODES as readonly string[]).includes(raw)) {
      return raw as ArticleSortMode;
    }
  } catch {
    // localStorage unavailable (private mode / SSR / sandboxed iframe) — fall through.
  }
  return "newest";
}

/** Group an article list into per-feed buckets. */
function groupByFeedId(articles: Article[]): Record<string, Article[]> {
  const byFeed: Record<string, Article[]> = {};
  for (const article of articles) {
    (byFeed[article.feedId] ??= []).push(article);
  }
  return byFeed;
}

/**
 * Sort starred articles by starredAt descending. Most recently starred
 * articles appear at the top of the starred view — independent of
 * publishedAt, which is the user's mental model ("the article I just
 * saved" should be on top, even if the article itself is old).
 */
function sortStarredArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => (b.starredAt ?? 0) - (a.starredAt ?? 0));
}

/**
 * Derive the visible article list for the requested (possibly aggregated)
 * feed id. ALL_FEEDS_ID flat-maps every loaded feed; folder feed ids restrict
 * to folder members; STARRED_FEED_ID flat-maps every starred article across
 * every feed; FILTER_FEED_PREFIX ids run the smart-filter evaluator over
 * every article and apply per-filter sort + limit overrides; a concrete
 * feed id returns that feed's list.
 *
 * Every path applies the current sort mode so switching the mode always
 * re-orders the visible list — except the starred view (always by
 * `starredAt` desc) and smart filters with a `sortMode` override.
 */
function deriveVisibleArticles(
  articlesByFeedId: Record<string, Article[]>,
  feedId: string,
  sortMode: ArticleSortMode,
  showMuted: boolean,
): Article[] {
  // Default views (ALL_FEEDS, specific feed, folder) suppress muted
  // unless the user has flipped showMuted. Starred and smart-filter
  // views are user-explicit selections and always show everything.
  const dropMuted = (a: Article) => showMuted || !a.muted;

  if (feedId === ALL_FEEDS_ID) {
    const flat: Article[] = [];
    for (const list of Object.values(articlesByFeedId)) {
      for (const a of list) if (dropMuted(a)) flat.push(a);
    }
    return sortArticles(flat, sortMode);
  }
  if (isStarredFeedId(feedId)) {
    const flat: Article[] = [];
    for (const list of Object.values(articlesByFeedId)) {
      for (const article of list) if (article.starred) flat.push(article);
    }
    return sortStarredArticles(flat);
  }
  if (isFilterFeedId(feedId)) {
    return deriveFilteredArticles(articlesByFeedId, feedId, sortMode);
  }
  if (isFolderFeedId(feedId)) {
    const folderId = fromFolderFeedId(feedId)!;
    const feeds = useFeedStore.getState().feeds;
    const feedFolderById = new Map(feeds.map((f) => [f.id, f.folderId]));
    const flat: Article[] = [];
    for (const list of Object.values(articlesByFeedId)) {
      for (const a of list) {
        if (!dropMuted(a)) continue;
        // Article-level folderId override wins; otherwise inherit
        // the article's feed folder. An article whose effective folder
        // doesn't match the requested view is skipped.
        const effective = a.folderId ?? feedFolderById.get(a.feedId);
        if (effective === folderId) flat.push(a);
      }
    }
    return sortArticles(flat, sortMode);
  }
  const list = articlesByFeedId[feedId] ?? [];
  return sortArticles(list.filter(dropMuted), sortMode);
}

/**
 * Evaluate a smart filter against every loaded article and return the
 * matching set, sorted + optionally limited per the filter's overrides.
 * Unknown filter id resolves to an empty list (no error) so a stale
 * URL after deletion is a soft fail.
 */
function deriveFilteredArticles(
  articlesByFeedId: Record<string, Article[]>,
  feedId: string,
  fallbackSortMode: ArticleSortMode,
): Article[] {
  const filterId = fromFilterFeedId(feedId);
  if (!filterId) return [];
  const filter = useSmartFilterStore
    .getState()
    .filters.find((f) => f.id === filterId);
  if (!filter) return [];

  const ctx = buildContext({
    feeds: useFeedStore.getState().feeds,
    filters: useSmartFilterStore.getState().filters,
  });

  const matched: Article[] = [];
  for (const list of Object.values(articlesByFeedId)) {
    for (const article of list) {
      if (evaluateFilter(filter, article, ctx)) matched.push(article);
    }
  }

  const sorted = sortArticles(matched, filter.sortMode ?? fallbackSortMode);
  return filter.limit !== undefined ? sorted.slice(0, filter.limit) : sorted;
}

/** Replace articles for a set of feeds and refresh the visible list. */
function mergeFetchedArticles(
  state: Pick<ArticleStore, "articlesByFeedId">,
  feedId: string,
  fetched: Article[],
): Record<string, Article[]> {
  const next = { ...state.articlesByFeedId };
  if (
    feedId === ALL_FEEDS_ID ||
    isStarredFeedId(feedId) ||
    isFilterFeedId(feedId) ||
    isFolderFeedId(feedId)
  ) {
    // Bulk paths return articles from many feeds — replace each feed's
    // bucket with its slice of the fetch so per-feed state matches the DB.
    const grouped = groupByFeedId(fetched);
    for (const [id, list] of Object.entries(grouped)) {
      next[id] = list;
    }
  } else {
    next[feedId] = fetched;
  }
  return next;
}

/** Test helper: reset the in-memory article state. */
export function clearArticleCache() {
  useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articlesByFeedId: {},
  articles: [],
  selectedArticle: null,
  isLoading: false,
  articleSortMode: loadPersistedSortMode(),
  showMuted: false,

  preloadAll: async () => {
    const result = await getAllArticles();
    if (!result.ok) return;
    set({ articlesByFeedId: groupByFeedId(result.value) });
  },

  loadArticles: async (feedId) => {
    // Show whatever we already have for this view instantly — derived from
    // the source of truth, no separate cache to keep in sync.
    const sortMode = get().articleSortMode;
    const cachedVisible = deriveVisibleArticles(
      get().articlesByFeedId,
      feedId,
      sortMode,
      get().showMuted,
    );
    set({
      articles: cachedVisible,
      selectedArticle: null,
      isLoading: cachedVisible.length === 0,
    });

    // Fetch fresh data in the background and merge it back into the source
    // of truth. Five paths mirror the five kinds of feed id:
    // - ALL_FEEDS_ID: one bulk query; results replace every feed bucket.
    // - STARRED_FEED_ID: one bulk query; filter retains only `starred`
    //   articles but every fetched article still updates its feed bucket
    //   so other views stay consistent.
    // - filter:<id>: one bulk query; evaluator runs over every loaded
    //   article in deriveVisibleArticles.
    // - folder:<id>: one bulk query, filtered on read to the folder's members.
    // - concrete feed id: targeted per-feed query.
    let fetched: Article[] = [];
    if (
      feedId === ALL_FEEDS_ID ||
      isStarredFeedId(feedId) ||
      isFilterFeedId(feedId)
    ) {
      const result = await getAllArticles();
      fetched = result.ok ? result.value : [];
    } else if (isFolderFeedId(feedId)) {
      const folderId = fromFolderFeedId(feedId)!;
      const memberIds = new Set(
        useFeedStore
          .getState()
          .feeds.filter((f) => f.folderId === folderId)
          .map((f) => f.id),
      );
      const result = await getAllArticles();
      fetched = result.ok
        ? result.value.filter((a) => memberIds.has(a.feedId))
        : [];
    } else {
      const result = await getArticles(feedId);
      fetched = result.ok ? result.value : [];
    }

    const nextByFeed = mergeFetchedArticles(get(), feedId, fetched);
    set({
      articlesByFeedId: nextByFeed,
      articles: deriveVisibleArticles(
        nextByFeed,
        feedId,
        get().articleSortMode,
        get().showMuted,
      ),
      isLoading: false,
    });
  },

  selectArticle: async (article) => {
    // Flush any pending mark-as-read immediately (don't lose the read state).
    if (markAsReadTimer) {
      clearTimeout(markAsReadTimer);
      markAsReadTimer = null;
      const prev = get().selectedArticle;
      if (prev && !prev.read) {
        const updated = { ...prev, read: true };
        set(applyArticleUpdate(get(), updated));
        updateArticle(updated).then(() => {
          useSyncStore.getState().scheduleSyncPush();
        });
      }
    }

    if (!article) {
      set({ selectedArticle: null });
      return;
    }

    // Validate article belongs to current feed. Aggregated views
    // (ALL_FEEDS_ID and folder feeds) accept articles from any member feed.
    const currentFeedId = useFeedStore.getState().selectedFeedId;
    if (
      currentFeedId &&
      !isAggregatedFeedId(currentFeedId) &&
      article.feedId !== currentFeedId
    ) {
      console.warn(
        `Rejecting article selection: article.feedId (${article.feedId}) !== selectedFeedId (${currentFeedId})`,
      );
      set({ selectedArticle: null });
      return;
    }

    set({ selectedArticle: article });

    if (!article.read) {
      markAsReadTimer = setTimeout(() => {
        markAsReadTimer = null;
        const updated = { ...article, read: true, readAt: Date.now() };
        set({
          ...applyArticleUpdate(get(), updated),
          selectedArticle: updated,
        });
        updateArticle(updated).then(() => {
          useSyncStore.getState().scheduleSyncPush();
        });
      }, MARK_AS_READ_DELAY);
    }
  },

  markAsRead: async (articleId) => {
    const article = get().articles.find((a) => a.id === articleId);
    if (!article || article.read) return;

    const updated = { ...article, read: true };
    set(applyArticleUpdate(get(), updated));
    await updateArticle(updated);
  },

  toggleStar: async (articleId) => {
    const buckets = get().articlesByFeedId;
    let target: Article | undefined;
    for (const list of Object.values(buckets)) {
      const hit = list.find((a) => a.id === articleId);
      if (hit) {
        target = hit;
        break;
      }
    }
    if (!target) return;

    const nextStarred = !target.starred;
    const updated: Article = nextStarred
      ? { ...target, starred: true, starredAt: Date.now() }
      : (() => {
          // Strip starredAt explicitly so the field disappears from the
          // serialized vault — otherwise an old timestamp would survive
          // an unstar and re-appear on the next encrypt/decrypt round.
          const { starredAt: _stripped, ...rest } = target;
          void _stripped;
          return { ...rest, starred: false };
        })();

    set(applyArticleUpdate(get(), updated));
    // The reader subscribes to `selectedArticle` (a separate slice from
    // `articlesByFeedId`), so refresh it too when the toggled article is
    // currently open — otherwise the icon stays grey until the user
    // navigates away. Mirrors the markAsRead helper above.
    if (get().selectedArticle?.id === updated.id) {
      set({ selectedArticle: updated });
    }
    const persistResult = await updateArticle(updated);
    if (persistResult.ok) {
      useSyncStore.getState().scheduleSyncPush();
    }
  },

  markAllAsRead: async () => {
    const unread = get().articles.filter((a) => !a.read);
    if (unread.length === 0) return;

    // Collapse every mutation into a single set() so subscribers see one
    // consistent transition. Group the updates by feed so we only touch the
    // buckets that actually changed.
    let nextByFeed = get().articlesByFeedId;
    const unreadById = new Map(unread.map((a) => [a.id, a]));
    for (const [feedId, articles] of Object.entries(nextByFeed)) {
      if (!articles.some((a) => unreadById.has(a.id))) continue;
      nextByFeed = {
        ...nextByFeed,
        [feedId]: articles.map((a) =>
          unreadById.has(a.id) ? { ...a, read: true } : a,
        ),
      };
    }
    set({
      articlesByFeedId: nextByFeed,
      articles: get().articles.map((a) => ({ ...a, read: true })),
    });

    for (const article of unread) {
      await updateArticle({ ...article, read: true });
    }
    useSyncStore.getState().scheduleSyncPush();
  },

  setArticleSortMode: (mode) => {
    // Guard so a typo or stale persisted value (after we drop a mode in a
    // future version) doesn't corrupt the store with an unknown literal.
    if (!(ARTICLE_SORT_MODES as readonly string[]).includes(mode)) return;
    // Re-sort the visible list in place. The set of visible articles doesn't
    // change with sort mode — only their order — so we don't need to know
    // the active feed id to do this correctly.
    set({
      articleSortMode: mode,
      articles: sortArticles(get().articles, mode),
    });
    persistPreferences({ articleSortMode: mode });
  },

  setShowMuted: (value) => {
    // Re-derive against the currently-selected feed so the change is
    // visible in the active view immediately. ALL_FEEDS_ID is the
    // default when no feed is selected — same path the sidebar uses.
    const activeFeedId = useFeedStore.getState().selectedFeedId ?? ALL_FEEDS_ID;
    set({
      showMuted: value,
      articles: deriveVisibleArticles(
        get().articlesByFeedId,
        activeFeedId,
        get().articleSortMode,
        value,
      ),
    });
  },
}));

/**
 * Pure reducer: return the next store slice after applying a single-article
 * update. Both `articlesByFeedId` (the source of truth) and `articles` (the
 * visible slice) are updated in one pass so they cannot drift.
 */
function applyArticleUpdate(
  state: Pick<ArticleStore, "articlesByFeedId" | "articles">,
  updated: Article,
): Pick<ArticleStore, "articlesByFeedId" | "articles"> {
  const existing = state.articlesByFeedId[updated.feedId] ?? [];
  const nextFeedArticles = existing.map((a) =>
    a.id === updated.id ? updated : a,
  );
  return {
    articlesByFeedId: {
      ...state.articlesByFeedId,
      [updated.feedId]: nextFeedArticles,
    },
    articles: state.articles.map((a) => (a.id === updated.id ? updated : a)),
  };
}
