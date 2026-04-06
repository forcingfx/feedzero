import { create } from "zustand";
import {
  getFeeds,
  getFeed,
  removeFeed as dbRemoveFeed,
  updateFeed as dbUpdateFeed,
} from "../core/storage/db.ts";
import {
  addFeedFlow,
  refreshFeed,
  refreshAllFeeds,
  reloadFeed,
} from "../core/feeds/feed-service.ts";
import { useSyncStore } from "./sync-store.ts";
import { CHANGELOG_FEED_PATH } from "../utils/constants.ts";
import type { Feed } from "../types/index.ts";
import type { Result } from "../utils/result.ts";

/** Sort feeds: changelog first, then alphabetical by title. */
function sortFeeds(feeds: Feed[]): Feed[] {
  return [...feeds].sort((a, b) => {
    const aIsChangelog = a.url.includes(CHANGELOG_FEED_PATH);
    const bIsChangelog = b.url.includes(CHANGELOG_FEED_PATH);
    if (aIsChangelog && !bIsChangelog) return -1;
    if (!aIsChangelog && bIsChangelog) return 1;
    return a.title.localeCompare(b.title);
  });
}

interface FeedStore {
  feeds: Feed[];
  selectedFeedId: string | null;
  isLoading: boolean;
  isRefreshingAll: boolean;
  refreshingFeedIds: Set<string>;
  error: string | null;
  loadFeeds: () => Promise<void>;
  addFeed: (url: string, prefetchedContent?: string) => Promise<Result<void>>;
  removeFeed: (feedId: string) => Promise<void>;
  renameFeed: (feedId: string, newTitle: string) => Promise<void>;
  reloadSingleFeed: (feedId: string) => Promise<void>;
  selectFeed: (feedId: string) => void;
  refreshAll: () => Promise<void>;
  refreshSingleFeed: (feedId: string) => Promise<void>;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  feeds: [],
  selectedFeedId: null,
  isLoading: false,
  isRefreshingAll: false,
  refreshingFeedIds: new Set(),
  error: null,

  loadFeeds: async () => {
    const result = await getFeeds();
    if (result.ok) {
      set({ feeds: sortFeeds(result.value) });
    } else {
      set({ feeds: [], error: result.error });
    }
  },

  addFeed: async (url, prefetchedContent) => {
    set({ isLoading: true, error: null });
    const result = await addFeedFlow(url, prefetchedContent ? { prefetchedContent } : undefined);
    if (!result.ok) {
      set({ isLoading: false, error: result.error });
      return { ok: false, error: result.error } as const;
    }
    const allFeeds = await getFeeds();
    set({
      feeds: allFeeds.ok ? sortFeeds(allFeeds.value) : get().feeds,
      selectedFeedId: result.value.feed.id,
      isLoading: false,
    });
    useSyncStore.getState().scheduleSyncPush();
    return { ok: true, value: undefined } as const;
  },

  removeFeed: async (feedId) => {
    const result = await dbRemoveFeed(feedId);
    if (!result.ok) return;
    const allFeeds = await getFeeds();
    const currentSelection = get().selectedFeedId;
    set({
      feeds: allFeeds.ok ? sortFeeds(allFeeds.value) : [],
      selectedFeedId: currentSelection === feedId ? null : currentSelection,
    });
    useSyncStore.getState().scheduleSyncPush();
  },

  renameFeed: async (feedId, newTitle) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    const updated = { ...feedResult.value, title: newTitle, updatedAt: Date.now() };
    await dbUpdateFeed(updated);
    const allFeeds = await getFeeds();
    set({ feeds: allFeeds.ok ? sortFeeds(allFeeds.value) : get().feeds });
    useSyncStore.getState().scheduleSyncPush();
  },

  selectFeed: (feedId) => set({ selectedFeedId: feedId }),

  refreshAll: async () => {
    if (get().isRefreshingAll) return;
    set({ isRefreshingAll: true });
    try {
      const syncStore = useSyncStore.getState();
      if (syncStore.credentials) {
        await syncStore.pull();
        const pulled = await getFeeds();
        if (pulled.ok) set({ feeds: pulled.value });
      }
      await refreshAllFeeds();
      const allFeeds = await getFeeds();
      if (allFeeds.ok) set({ feeds: sortFeeds(allFeeds.value) });
      useSyncStore.getState().scheduleSyncPush();
    } finally {
      set({ isRefreshingAll: false });
    }
  },

  reloadSingleFeed: async (feedId) => {
    const ids = new Set(get().refreshingFeedIds);
    ids.add(feedId);
    set({ refreshingFeedIds: ids });
    try {
      const feedResult = await getFeed(feedId);
      if (!feedResult.ok) return;
      const feed = feedResult.value;

      // For same-origin feeds (changelog), fetch directly to bypass proxy SSRF
      let options: { prefetchedContent?: string } | undefined;
      if (feed.url.includes(CHANGELOG_FEED_PATH)) {
        try {
          const res = await fetch(CHANGELOG_FEED_PATH);
          if (res.ok) options = { prefetchedContent: await res.text() };
        } catch { /* fall through to proxy */ }
      }

      await reloadFeed(feed, options);
      const { loadArticles, preloadAll } = await import("./article-store.ts").then(m => m.useArticleStore.getState());
      await preloadAll();
      const selectedFeedId = get().selectedFeedId;
      if (selectedFeedId) await loadArticles(selectedFeedId);
    } finally {
      const ids = new Set(get().refreshingFeedIds);
      ids.delete(feedId);
      set({ refreshingFeedIds: ids });
    }
    useSyncStore.getState().scheduleSyncPush();
  },

  refreshSingleFeed: async (feedId) => {
    const ids = new Set(get().refreshingFeedIds);
    ids.add(feedId);
    set({ refreshingFeedIds: ids });
    try {
      const feedResult = await getFeed(feedId);
      if (!feedResult.ok) return;
      await refreshFeed(feedResult.value);
      const allFeeds = await getFeeds();
      if (allFeeds.ok) set({ feeds: sortFeeds(allFeeds.value) });
    } finally {
      const ids = new Set(get().refreshingFeedIds);
      ids.delete(feedId);
      set({ refreshingFeedIds: ids });
    }
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
