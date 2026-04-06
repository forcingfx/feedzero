import { create } from "zustand";
import {
  getArticles,
  getAllArticles,
  updateArticle,
} from "../core/storage/db.ts";
import { useSyncStore } from "./sync-store.ts";
import { useFeedStore } from "./feed-store.ts";
import { ALL_FEEDS_ID } from "../utils/constants.ts";
import type { Article } from "../types/index.ts";

interface ArticleStore {
  /** Currently visible articles (derived from cache for the active feed). */
  articles: Article[];
  selectedArticle: Article | null;
  isLoading: boolean;
  /** Unread count per feedId — updated on preload and mark-as-read. */
  unreadCounts: Record<string, number>;
  /** Preload all articles into cache and compute unread counts. */
  preloadAll: () => Promise<void>;
  loadArticles: (feedId: string) => Promise<void>;
  selectArticle: (article: Article | null) => Promise<void>;
  markAsRead: (articleId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

/** Delay before an opened article is marked as read (ms). */
const MARK_AS_READ_DELAY = 1000;
const PAGE_SIZE = 25;
let markAsReadTimer: ReturnType<typeof setTimeout> | null = null;

/** Per-feed article cache — instant switching, no flicker. */
const articleCache = new Map<string, Article[]>();

/** Clear the article cache (used by tests). */
export function clearArticleCache() {
  articleCache.clear();
}

/** Update an article in the cache (e.g., after marking as read). */
function updateCachedArticle(article: Article) {
  for (const [feedId, cached] of articleCache) {
    const idx = cached.findIndex((a) => a.id === article.id);
    if (idx !== -1) {
      cached[idx] = article;
      // Also update the "all" cache if it exists and this isn't the "all" feed
      if (feedId !== ALL_FEEDS_ID) {
        const allCached = articleCache.get(ALL_FEEDS_ID);
        if (allCached) {
          const allIdx = allCached.findIndex((a) => a.id === article.id);
          if (allIdx !== -1) allCached[allIdx] = article;
        }
      }
      break;
    }
  }
}

/** Recompute unread counts from the article cache. */
function computeUnreadCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [feedId, articles] of articleCache) {
    if (feedId === ALL_FEEDS_ID) continue;
    counts[feedId] = articles.filter((a) => !a.read).length;
  }
  return counts;
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  selectedArticle: null,
  isLoading: false,
  unreadCounts: {},

  preloadAll: async () => {
    const result = await getAllArticles();
    if (!result.ok) return;

    const all = result.value;
    // Group by feedId and populate cache
    const byFeed = new Map<string, Article[]>();
    for (const article of all) {
      const list = byFeed.get(article.feedId);
      if (list) list.push(article);
      else byFeed.set(article.feedId, [article]);
    }
    for (const [feedId, articles] of byFeed) {
      articleCache.set(feedId, articles.slice(0, PAGE_SIZE));
    }
    articleCache.set(ALL_FEEDS_ID, all.slice(0, PAGE_SIZE));
    set({ unreadCounts: computeUnreadCounts() });
  },

  loadArticles: async (feedId) => {
    // Show cached articles instantly if available (no loading state)
    const cached = articleCache.get(feedId);
    if (cached) {
      set({ articles: cached, selectedArticle: null, isLoading: false });
    } else {
      set({ articles: [], selectedArticle: null, isLoading: true });
    }

    // Fetch fresh data in background
    const result =
      feedId === ALL_FEEDS_ID
        ? await getAllArticles(PAGE_SIZE)
        : await getArticles(feedId, PAGE_SIZE);

    const fresh = result.ok ? result.value : [];
    articleCache.set(feedId, fresh);
    set({ articles: fresh, isLoading: false });
  },

  selectArticle: async (article) => {
    // Flush any pending mark-as-read immediately (don't lose the read state)
    if (markAsReadTimer) {
      clearTimeout(markAsReadTimer);
      markAsReadTimer = null;
      const prev = get().selectedArticle;
      if (prev && !prev.read) {
        const updated = { ...prev, read: true };
        updateCachedArticle(updated);
        set({
          articles: get().articles.map((a) =>
            a.id === prev.id ? updated : a,
          ),
        });
        updateArticle(updated).then(() => {
          useSyncStore.getState().scheduleSyncPush();
        });
      }
    }

    if (!article) {
      set({ selectedArticle: null });
      return;
    }

    // Validate article belongs to current feed (skip check for global view)
    const currentFeedId = useFeedStore.getState().selectedFeedId;
    if (
      currentFeedId &&
      currentFeedId !== ALL_FEEDS_ID &&
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
        updateCachedArticle(updated);
        set({
          selectedArticle: updated,
          articles: get().articles.map((a) =>
            a.id === article.id ? updated : a,
          ),
          unreadCounts: computeUnreadCounts(),
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
    updateCachedArticle(updated);
    await updateArticle(updated);
    set({
      articles: get().articles.map((a) =>
        a.id === articleId ? { ...a, read: true } : a,
      ),
      unreadCounts: computeUnreadCounts(),
    });
  },

  markAllAsRead: async () => {
    const unread = get().articles.filter((a) => !a.read);
    if (unread.length === 0) return;

    const updated = get().articles.map((a) =>
      a.read ? a : { ...a, read: true },
    );
    // Update cache for current feed
    const currentFeedId = useFeedStore.getState().selectedFeedId;
    if (currentFeedId) articleCache.set(currentFeedId, updated);
    set({ articles: updated });

    for (const article of unread) {
      const readArticle = { ...article, read: true };
      updateCachedArticle(readArticle);
      await updateArticle(readArticle);
    }
    set({ unreadCounts: computeUnreadCounts() });
    useSyncStore.getState().scheduleSyncPush();
  },
}));
