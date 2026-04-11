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
} from "../core/storage/db.ts";
import {
  addFeedFlow,
  refreshFeed,
  refreshAllFeeds,
  reloadFeed,
} from "../core/feeds/feed-service.ts";
import { useSyncStore } from "./sync-store.ts";
import { CHANGELOG_FEED_URL } from "../utils/constants.ts";
import type { Feed, Folder } from "../types/index.ts";
import type { Result } from "../utils/result.ts";

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
  error: string | null;
  loadFeeds: () => Promise<void>;
  addFeed: (url: string) => Promise<Result<void>>;
  removeFeed: (feedId: string) => Promise<void>;
  renameFeed: (feedId: string, newTitle: string) => Promise<void>;
  reloadSingleFeed: (feedId: string) => Promise<void>;
  selectFeed: (feedId: string) => void;
  refreshAll: () => Promise<void>;
  refreshSingleFeed: (feedId: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveFeedToFolder: (feedId: string, folderId: string | null) => Promise<void>;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  feeds: [],
  folders: [],
  selectedFeedId: null,
  isLoading: false,
  isRefreshingAll: false,
  refreshingFeedIds: new Set(),
  error: null,

  loadFeeds: async () => {
    const [feedsResult, foldersResult] = await Promise.all([getFeeds(), dbGetFolders()]);
    set({
      feeds: feedsResult.ok ? sortFeeds(feedsResult.value) : [],
      folders: foldersResult.ok ? foldersResult.value.sort((a, b) => a.name.localeCompare(b.name)) : [],
      error: feedsResult.ok ? null : feedsResult.error,
    });
  },

  addFeed: async (url) => {
    set({ isLoading: true, error: null });
    const result = await addFeedFlow(url);
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

      await reloadFeed(feed);
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

  createFolder: async (name) => {
    const folder: Folder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    await dbAddFolder(folder);
    const result = await dbGetFolders();
    if (result.ok) set({ folders: result.value.sort((a, b) => a.name.localeCompare(b.name)) });
    useSyncStore.getState().scheduleSyncPush();
  },

  renameFolder: async (folderId, name) => {
    const folders = get().folders;
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    await dbUpdateFolder({ ...folder, name });
    const result = await dbGetFolders();
    if (result.ok) set({ folders: result.value.sort((a, b) => a.name.localeCompare(b.name)) });
    useSyncStore.getState().scheduleSyncPush();
  },

  deleteFolder: async (folderId) => {
    // Unfiled all feeds in this folder
    const feeds = get().feeds.filter((f) => f.folderId === folderId);
    for (const feed of feeds) {
      await dbUpdateFeed({ ...feed, folderId: undefined, updatedAt: Date.now() });
    }
    await dbRemoveFolder(folderId);
    const [feedsResult, foldersResult] = await Promise.all([getFeeds(), dbGetFolders()]);
    set({
      feeds: feedsResult.ok ? sortFeeds(feedsResult.value) : get().feeds,
      folders: foldersResult.ok ? foldersResult.value.sort((a, b) => a.name.localeCompare(b.name)) : get().folders,
    });
    useSyncStore.getState().scheduleSyncPush();
  },

  moveFeedToFolder: async (feedId, folderId) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    await dbUpdateFeed({ ...feedResult.value, folderId: folderId ?? undefined, updatedAt: Date.now() });
    const allFeeds = await getFeeds();
    if (allFeeds.ok) set({ feeds: sortFeeds(allFeeds.value) });
    useSyncStore.getState().scheduleSyncPush();
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
