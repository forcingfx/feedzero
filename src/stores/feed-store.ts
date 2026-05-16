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
import { useArticleStore } from "./article-store.ts";
import { useLicenseStore } from "./license-store.ts";
import { gateState } from "../core/features/feature-gates.ts";
import { isSelfHosted } from "../core/features/self-hosted.ts";
import { checkFeedQuota, quotaErrorMessage } from "../core/features/quotas.ts";
import { CHANGELOG_FEED_URL, LOCAL_STORAGE } from "../utils/constants.ts";
import { pickNextFolderColor } from "../lib/folder-colors.ts";
import { toast } from "sonner";
import type { Feed, Folder, FeedSortMode } from "../types/index.ts";
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
  feedSortMode: FeedSortMode;
  feedCustomOrder: string[];
  folderCustomOrder: string[];
  /** True once loadFeeds() has resolved at least once. Used by the
   *  /feeds → /explore-vs-/feeds/all routing decision to avoid firing
   *  with an empty store before the DB is read. */
  feedsLoaded: boolean;
  loadFeeds: () => Promise<void>;
  addFeed: (url: string) => Promise<Result<void>>;
  removeFeed: (feedId: string) => Promise<void>;
  renameFeed: (feedId: string, newTitle: string) => Promise<void>;
  setFeedPreferFullText: (feedId: string, value: boolean) => Promise<void>;
  reloadSingleFeed: (feedId: string) => Promise<void>;
  selectFeed: (feedId: string) => void;
  refreshAll: () => Promise<void>;
  refreshSingleFeed: (feedId: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
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

export const useFeedStore = create<FeedStore>((set, get) => ({
  feeds: [],
  folders: [],
  selectedFeedId: null,
  isLoading: false,
  isRefreshingAll: false,
  refreshingFeedIds: new Set(),
  error: null,
  feedSortMode: readSortMode(),
  feedCustomOrder: readJsonArray(LOCAL_STORAGE.FEED_CUSTOM_ORDER),
  folderCustomOrder: readJsonArray(LOCAL_STORAGE.FOLDER_CUSTOM_ORDER),
  folderOpenState: {},
  feedsLoaded: false,

  loadFeeds: async () => {
    const [feedsResult, foldersResult] = await Promise.all([getFeeds(), dbGetFolders()]);
    set({
      feeds: feedsResult.ok ? sortFeeds(feedsResult.value) : [],
      folders: foldersResult.ok ? foldersResult.value.sort((a, b) => a.name.localeCompare(b.name)) : [],
      error: feedsResult.ok ? null : feedsResult.error,
      feedsLoaded: true,
    });
  },

  addFeed: async (url) => {
    // Free hosted users are capped at 25 feed subscriptions (ADR 013).
    // Personal/Pro and self-hosted bypass. Check BEFORE touching the
    // ingestion pipeline so we don't half-add a feed then fail late.
    const quota = checkFeedQuota({
      currentCount: get().feeds.length,
      tier: useLicenseStore.getState().tier,
      isSelfHosted: isSelfHosted(),
    });
    if (!quota.ok) {
      const message = quotaErrorMessage(quota);
      set({ error: message });
      return { ok: false, error: message } as const;
    }

    set({ isLoading: true, error: null });
    const result = await addFeedFlow(url);
    if (!result.ok) {
      set({ isLoading: false, error: result.error });
      return { ok: false, error: result.error } as const;
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

  setFeedPreferFullText: async (feedId, value) => {
    const feedResult = await getFeed(feedId);
    if (!feedResult.ok) return;
    const updated = { ...feedResult.value, preferFullText: value, updatedAt: Date.now() };
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
    const color = pickNextFolderColor(get().folders.map((f) => f.color));
    const folder: Folder = { id: crypto.randomUUID(), name, color, createdAt: Date.now() };
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

  updateFolderColor: async (folderId, color) => {
    const folders = get().folders;
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    await dbUpdateFolder({ ...folder, color });
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

  setFeedSortMode: (mode) => {
    try { localStorage.setItem(LOCAL_STORAGE.FEED_SORT_MODE, mode); } catch { /* ignore */ }
    set({ feedSortMode: mode });
  },

  reorderFeeds: (orderedIds) => {
    try { localStorage.setItem(LOCAL_STORAGE.FEED_CUSTOM_ORDER, JSON.stringify(orderedIds)); } catch { /* ignore */ }
    set({ feedCustomOrder: orderedIds });
  },

  reorderFolders: (orderedIds) => {
    try { localStorage.setItem(LOCAL_STORAGE.FOLDER_CUSTOM_ORDER, JSON.stringify(orderedIds)); } catch { /* ignore */ }
    set({ folderCustomOrder: orderedIds });
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
    // bypass the honor-system check. UI handles its own messaging — the toast
    // here is for the edge case where state diverges.
    const gate = gateState(
      "auto-organize",
      useLicenseStore.getState().tier,
      isSelfHosted(),
    );
    if (!gate.enabled) {
      toast("Auto-organize is a Personal feature. Subscribe to unlock.");
      return;
    }

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
    const foldersResult = await dbGetFolders();
    if (foldersResult.ok) {
      set({
        folders: foldersResult.value.sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      });
    }

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
