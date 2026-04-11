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
  isFolderFeedId,
  isAggregatedFeedId,
  fromFolderFeedId,
} from "../utils/constants.ts";
import type { Article } from "../types/index.ts";

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
  /** Preload every article into the store; used on startup and on refresh. */
  preloadAll: () => Promise<void>;
  loadArticles: (feedId: string) => Promise<void>;
  selectArticle: (article: Article | null) => Promise<void>;
  markAsRead: (articleId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
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

/** Sort articles by publishedAt descending (most recent first). */
function sortArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
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
 * Derive the visible article list for the requested (possibly aggregated)
 * feed id. ALL_FEEDS_ID flat-maps every loaded feed; folder feed ids restrict
 * to folder members; a concrete feed id returns that feed's list directly.
 */
function deriveVisibleArticles(
  articlesByFeedId: Record<string, Article[]>,
  feedId: string,
): Article[] {
  if (feedId === ALL_FEEDS_ID) {
    const flat: Article[] = [];
    for (const list of Object.values(articlesByFeedId)) flat.push(...list);
    return sortArticles(flat);
  }
  if (isFolderFeedId(feedId)) {
    const folderId = fromFolderFeedId(feedId)!;
    const memberIds = new Set(
      useFeedStore
        .getState()
        .feeds.filter((f) => f.folderId === folderId)
        .map((f) => f.id),
    );
    const flat: Article[] = [];
    for (const [id, list] of Object.entries(articlesByFeedId)) {
      if (memberIds.has(id)) flat.push(...list);
    }
    return sortArticles(flat);
  }
  return articlesByFeedId[feedId] ?? [];
}

/** Replace articles for a set of feeds and refresh the visible list. */
function mergeFetchedArticles(
  state: Pick<ArticleStore, "articlesByFeedId">,
  feedId: string,
  fetched: Article[],
): Record<string, Article[]> {
  const next = { ...state.articlesByFeedId };
  if (feedId === ALL_FEEDS_ID || isFolderFeedId(feedId)) {
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

  preloadAll: async () => {
    const result = await getAllArticles();
    if (!result.ok) return;
    set({ articlesByFeedId: groupByFeedId(result.value) });
  },

  loadArticles: async (feedId) => {
    // Show whatever we already have for this view instantly — derived from
    // the source of truth, no separate cache to keep in sync.
    const cachedVisible = deriveVisibleArticles(get().articlesByFeedId, feedId);
    set({
      articles: cachedVisible,
      selectedArticle: null,
      isLoading: cachedVisible.length === 0,
    });

    // Fetch fresh data in the background and merge it back into the source
    // of truth. Three paths mirror the three kinds of feed id:
    // - ALL_FEEDS_ID: one bulk query; results replace every feed bucket.
    // - folder:<id>: one bulk query, filtered on read to the folder's members.
    // - concrete feed id: targeted per-feed query.
    let fetched: Article[] = [];
    if (feedId === ALL_FEEDS_ID) {
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
      articles: deriveVisibleArticles(nextByFeed, feedId),
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
        const updated = { ...article, read: true };
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
