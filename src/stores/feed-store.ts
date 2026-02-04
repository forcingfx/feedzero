import { create } from "zustand";
import {
  getFeeds,
  getFeed,
  removeFeed as dbRemoveFeed,
} from "../core/storage/db.ts";
import {
  addFeedFlow,
  refreshFeed,
  refreshAllFeeds,
} from "../core/feeds/feed-service.ts";
import { useSyncStore } from "./sync-store.ts";
import type { Feed } from "../types/index.ts";

interface FeedStore {
  feeds: Feed[];
  selectedFeedId: string | null;
  isLoading: boolean;
  isRefreshingAll: boolean;
  refreshingFeedIds: Set<string>;
  error: string | null;
  loadFeeds: () => Promise<void>;
  addFeed: (url: string) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
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
      set({ feeds: result.value });
    } else {
      set({ feeds: [], error: result.error });
    }
  },

  addFeed: async (url) => {
    set({ isLoading: true, error: null });
    const result = await addFeedFlow(url);
    if (!result.ok) {
      set({ isLoading: false, error: result.error });
      return;
    }
    const allFeeds = await getFeeds();
    set({
      feeds: allFeeds.ok ? allFeeds.value : get().feeds,
      selectedFeedId: result.value.feed.id,
      isLoading: false,
    });
    useSyncStore.getState().scheduleSyncPush();
  },

  removeFeed: async (feedId) => {
    const result = await dbRemoveFeed(feedId);
    if (!result.ok) return;
    const allFeeds = await getFeeds();
    const currentSelection = get().selectedFeedId;
    set({
      feeds: allFeeds.ok ? allFeeds.value : [],
      selectedFeedId: currentSelection === feedId ? null : currentSelection,
    });
    useSyncStore.getState().scheduleSyncPush();
  },

  selectFeed: (feedId) => set({ selectedFeedId: feedId }),

  refreshAll: async () => {
    if (get().isRefreshingAll) return;
    set({ isRefreshingAll: true });
    try {
      await refreshAllFeeds();
      const allFeeds = await getFeeds();
      if (allFeeds.ok) set({ feeds: allFeeds.value });
      useSyncStore.getState().scheduleSyncPush();
    } finally {
      set({ isRefreshingAll: false });
    }
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
      if (allFeeds.ok) set({ feeds: allFeeds.value });
    } finally {
      const ids = new Set(get().refreshingFeedIds);
      ids.delete(feedId);
      set({ refreshingFeedIds: ids });
    }
  },
}));
