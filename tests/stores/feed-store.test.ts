import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeedStore, selectFeedsById } from "../../src/stores/feed-store.ts";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import { isSelfHosted } from "../../src/core/features/self-hosted.ts";
import { isPaidTierActive } from "../../src/core/features/paid-tier-active.ts";
import { toast } from "sonner";

vi.mock("../../src/core/features/self-hosted.ts", () => ({
  isSelfHosted: vi.fn(() => false),
}));

vi.mock("../../src/core/features/paid-tier-active.ts", () => ({
  // Default to "paid tier launched" so quota/gate tests in this file assert
  // the enforcement path. The new pre-launch test below flips it false.
  isPaidTierActive: vi.fn(() => true),
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

vi.mock("../../src/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  updateFeed: vi.fn(),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn(),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
}));

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  addPlaceholderFeed: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("../../src/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn().mockResolvedValue({
    ok: true,
    value: { extracted: 0, failed: 0 },
  }),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { getFeeds, getFeed, removeFeed, updateFeed, getFolders, addFolder, updateFolder, removeFolder, getArticles } from "../../src/core/storage/db.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "../../src/utils/constants.ts";
import {
  addFeedFlow,
  addPlaceholderFeed,
  refreshFeed,
  refreshAllFeeds,
  reloadFeed,
} from "../../src/core/feeds/feed-service.ts";
import { prefetchStarredArticles } from "../../src/core/extractor/prefetch-service.ts";
import {
  clearFaviconCache,
  getFaviconStrategyIndex,
  setFaviconCacheEntry,
} from "../../src/core/favicon/favicon-cache.ts";

const mockFeed = (id: string, title: string) => ({
  id,
  url: `https://${id}.com/feed`,
  title,
  description: "",
  siteUrl: `https://${id}.com`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe("feed-store", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      folders: [],
      selectedFeedId: null,
      recentFeedIds: [],
      isLoading: false,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
      lastRefreshAllAt: null,
      error: null,
    });
    vi.clearAllMocks();
    // Default to Personal tier so existing tests don't trip the
    // auto-organize gate. Free / locked variants set their own tier.
    useLicenseStore.setState({ tier: "personal", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(true);
  });

  it("starts empty", () => {
    const s = useFeedStore.getState();
    expect(s.feeds).toEqual([]);
    expect(s.selectedFeedId).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  describe("loadFeeds", () => {
    it("loads feeds from db", async () => {
      const feeds = [mockFeed("a", "A"), mockFeed("b", "B")];
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: feeds });

      await useFeedStore.getState().loadFeeds();

      expect(useFeedStore.getState().feeds).toEqual(feeds);
    });

    it("sets error on failure", async () => {
      vi.mocked(getFeeds).mockResolvedValue({
        ok: false,
        error: "load failed",
      });

      await useFeedStore.getState().loadFeeds();

      expect(useFeedStore.getState().feeds).toEqual([]);
      expect(useFeedStore.getState().error).toBe("load failed");
    });
  });

  describe("addFeed", () => {
    it("calls addFeedFlow and reloads feeds", async () => {
      const feed = mockFeed("new", "New Feed");
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: true,
        value: { feed, articles: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

      await useFeedStore.getState().addFeed("https://new.com/feed");

      expect(addFeedFlow).toHaveBeenCalledWith(
        "https://new.com/feed",
        expect.objectContaining({ bridgesEnabled: expect.any(Boolean) }),
      );
      expect(useFeedStore.getState().feeds).toEqual([feed]);
      expect(useFeedStore.getState().selectedFeedId).toBe("new");
    });

    it("populates the article-store with the new feed's articles so the sidebar badge is live immediately", async () => {
      // Root cause of the "badge doesn't update after adding from Explore"
      // bug: feed-store.addFeed threw away the articles returned by
      // addFeedFlow, so article-store never learned about them. The user
      // had to click the feed to trigger loadArticles, which finally wrote
      // to the source of truth. Under the derived-unread-count model, the
      // badge reflects whatever is in article-store, so addFeed must push
      // the new articles through.
      useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
      const feed = mockFeed("new", "New Feed");
      const articles = [
        {
          id: "a1",
          feedId: "new",
          guid: "a1",
          title: "A",
          link: "https://new.com/a1",
          content: "",
          summary: "",
          author: "",
          publishedAt: Date.now(),
          read: false,
          createdAt: Date.now(),
        },
        {
          id: "a2",
          feedId: "new",
          guid: "a2",
          title: "B",
          link: "https://new.com/a2",
          content: "",
          summary: "",
          author: "",
          publishedAt: Date.now(),
          read: false,
          createdAt: Date.now(),
        },
      ];
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: true,
        value: { feed, articles },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

      await useFeedStore.getState().addFeed("https://new.com/feed");

      expect(
        useArticleStore.getState().articlesByFeedId["new"],
      ).toEqual(articles);
    });

    it("sets error on failure and returns error result", async () => {
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: false,
        error: "not a feed",
      });

      const result = await useFeedStore.getState().addFeed("https://bad.com");

      expect(useFeedStore.getState().error).toBe("not a feed");
      expect(result).toEqual({ ok: false, error: "not a feed" });
    });

    it("threads reason='fetch-failure' through so callers can create a placeholder", async () => {
      // The import flow needs to distinguish recoverable failures (HTTP /
      // network) from permanent ones (not a feed). The reason flag
      // propagates from addFeedFlow through addFeed without modification.
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: false,
        error: "HTTP 429",
        reason: "fetch-failure",
      });

      const result = await useFeedStore
        .getState()
        .addFeed("https://rate-limited.example.com");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("fetch-failure");
      }
    });

    it("returns ok result on success", async () => {
      const feed = mockFeed("new", "New Feed");
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: true,
        value: { feed, articles: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

      const result = await useFeedStore
        .getState()
        .addFeed("https://new.com/feed");

      expect(result).toEqual({ ok: true, value: undefined });
    });

    describe("Free quota gate (hard cutover at 50 feeds)", () => {
      function seedFeeds(n: number) {
        const feeds = Array.from({ length: n }, (_, i) =>
          mockFeed(`f${i}`, `Feed ${i}`),
        );
        useFeedStore.setState({ feeds });
      }

      it("blocks addFeed on hosted Free when already at 50 feeds", async () => {
        useLicenseStore.setState({ tier: "free", verifying: false });
        seedFeeds(50);

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatch(/Free limit of 50/);
        }
        expect(addFeedFlow).not.toHaveBeenCalled();
      });

      it("allows addFeed on hosted Free at 49 feeds (boundary)", async () => {
        useLicenseStore.setState({ tier: "free", verifying: false });
        seedFeeds(49);
        const feed = mockFeed("new", "New Feed");
        vi.mocked(addFeedFlow).mockResolvedValue({
          ok: true,
          value: { feed, articles: [] },
        });
        vi.mocked(getFeeds).mockResolvedValue({
          ok: true,
          value: [...useFeedStore.getState().feeds, feed],
        });

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(true);
        expect(addFeedFlow).toHaveBeenCalledOnce();
      });

      it("does NOT block Personal user with 100 feeds", async () => {
        useLicenseStore.setState({ tier: "personal", verifying: false });
        seedFeeds(100);
        const feed = mockFeed("new", "New Feed");
        vi.mocked(addFeedFlow).mockResolvedValue({
          ok: true,
          value: { feed, articles: [] },
        });
        vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(true);
      });

      it("does NOT block self-hosted Free user with 100 feeds", async () => {
        useLicenseStore.setState({ tier: "free", verifying: false });
        vi.mocked(isSelfHosted).mockReturnValue(true);
        seedFeeds(100);
        const feed = mockFeed("new", "New Feed");
        vi.mocked(addFeedFlow).mockResolvedValue({
          ok: true,
          value: { feed, articles: [] },
        });
        vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(true);
      });

      it("sets store.error so a Settings indicator can render the quota warning", async () => {
        useLicenseStore.setState({ tier: "free", verifying: false });
        seedFeeds(50);

        await useFeedStore.getState().addFeed("https://new.com/feed");

        expect(useFeedStore.getState().error).toMatch(/Free limit of 50/);
      });

      it("tags the failure with reason='free-quota-exceeded' so callers can route the user to upgrade", async () => {
        // The shared upgrade pattern (feature visible → click → upgrade
        // toast) depends on callers being able to tell a quota refusal
        // apart from a network/parse error. The reason discriminator is
        // the contract: every add-feed call site reads it.
        useLicenseStore.setState({ tier: "free", verifying: false });
        seedFeeds(50);

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe("free-quota-exceeded");
        }
      });

      it("does NOT block Free user with 100 feeds when the paid tier is inactive (pre-launch)", async () => {
        useLicenseStore.setState({ tier: "free", verifying: false });
        vi.mocked(isPaidTierActive).mockReturnValue(false);
        seedFeeds(100);
        const feed = mockFeed("new", "New Feed");
        vi.mocked(addFeedFlow).mockResolvedValue({
          ok: true,
          value: { feed, articles: [] },
        });
        vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

        const result = await useFeedStore
          .getState()
          .addFeed("https://new.com/feed");

        expect(result.ok).toBe(true);
        expect(addFeedFlow).toHaveBeenCalledOnce();
      });
    });
  });

  describe("addPlaceholderFeed", () => {
    it("delegates to the core helper, reloads feeds, and schedules a sync push", async () => {
      const placeholder = mockFeed("ph", "rate-limited.example.com");
      vi.mocked(addPlaceholderFeed).mockResolvedValue({
        ok: true,
        value: placeholder,
      });
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [placeholder],
      });
      const scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");

      const result = await useFeedStore
        .getState()
        .addPlaceholderFeed("https://rate-limited.example.com", "HTTP 429");

      expect(addPlaceholderFeed).toHaveBeenCalledWith(
        "https://rate-limited.example.com",
        "HTTP 429",
      );
      expect(result.ok).toBe(true);
      expect(useFeedStore.getState().feeds).toContainEqual(placeholder);
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("returns err and skips reload when the core helper rejects (e.g. duplicate)", async () => {
      vi.mocked(addPlaceholderFeed).mockResolvedValue({
        ok: false,
        error: "A feed with this URL already exists",
      });

      const result = await useFeedStore
        .getState()
        .addPlaceholderFeed("https://dup.example.com", "boom");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/already exists/i);
      }
    });
  });

  describe("removeFeed", () => {
    it("removes feed and clears selection if active", async () => {
      const feed = mockFeed("x", "X");
      useFeedStore.setState({ feeds: [feed], selectedFeedId: "x" });
      vi.mocked(removeFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().removeFeed("x");

      expect(removeFeed).toHaveBeenCalledWith("x");
      expect(useFeedStore.getState().feeds).toEqual([]);
      expect(useFeedStore.getState().selectedFeedId).toBeNull();
    });

    it("prunes the removed feed from the quick-switch recency list", async () => {
      const feed = mockFeed("x", "X");
      useFeedStore.setState({ feeds: [feed], recentFeedIds: ["x", "y"] });
      vi.mocked(removeFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().removeFeed("x");

      expect(useFeedStore.getState().recentFeedIds).toEqual(["y"]);
    });
  });

  describe("renameFeed", () => {
    it("updates the feed title and reloads feeds", async () => {
      const feed = mockFeed("f1", "Old Title");
      useFeedStore.setState({ feeds: [feed] });
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      const renamed = { ...feed, title: "New Title" };
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [renamed] });

      await useFeedStore.getState().renameFeed("f1", "New Title");

      expect(updateFeed).toHaveBeenCalledWith(expect.objectContaining({ title: "New Title" }));
      expect(useFeedStore.getState().feeds[0].title).toBe("New Title");
    });
  });

  describe("setFeedPreferFullText", () => {
    it("persists the new flag via updateFeed and reloads feeds", async () => {
      const feed = mockFeed("f1", "Example");
      useFeedStore.setState({ feeds: [feed] });
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [{ ...feed, preferFullText: true }],
      });

      await useFeedStore.getState().setFeedPreferFullText("f1", true);

      expect(updateFeed).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f1", preferFullText: true }),
      );
      expect(useFeedStore.getState().feeds[0].preferFullText).toBe(true);
    });

    it("no-ops when the feed cannot be found", async () => {
      vi.mocked(getFeed).mockResolvedValue({ ok: false, error: "not found" });

      await useFeedStore.getState().setFeedPreferFullText("missing", true);

      expect(updateFeed).not.toHaveBeenCalled();
    });
  });

  describe("selectFeed", () => {
    it("sets selectedFeedId", () => {
      useFeedStore.getState().selectFeed("abc");
      expect(useFeedStore.getState().selectedFeedId).toBe("abc");
    });

    it("records the viewed feed as most-recent for the quick-switch dock", () => {
      useFeedStore.setState({ recentFeedIds: ["feed-2"] });
      useFeedStore.getState().selectFeed("feed-1");
      expect(useFeedStore.getState().recentFeedIds).toEqual(["feed-1", "feed-2"]);
    });

    it("persists the recency list so the dock survives a reload", () => {
      useFeedStore.setState({ recentFeedIds: [] });
      useFeedStore.getState().selectFeed("feed-1");
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "feedzero:recent-feed-ids",
        JSON.stringify(["feed-1"]),
      );
    });

    it("does not record aggregated views (All / Starred / smart-filter) — they have no favicon", () => {
      useFeedStore.setState({ recentFeedIds: [] });
      useFeedStore.getState().selectFeed("all");
      useFeedStore.getState().selectFeed("starred");
      useFeedStore.getState().selectFeed("filter:abc-123");
      expect(useFeedStore.getState().recentFeedIds).toEqual([]);
    });
  });

  describe("refreshAll", () => {
    it("refreshes all feeds and reloads", async () => {
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().refreshAll();

      expect(refreshAllFeeds).toHaveBeenCalled();
      expect(getFeeds).toHaveBeenCalled();
    });

    it("debounces concurrent calls", async () => {
      vi.mocked(refreshAllFeeds).mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(() => r({ ok: true, value: { results: [] } }), 50),
          ),
      );
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      const p1 = useFeedStore.getState().refreshAll();
      const p2 = useFeedStore.getState().refreshAll();
      await Promise.all([p1, p2]);

      expect(refreshAllFeeds).toHaveBeenCalledTimes(1);
    });

    it("clears failed favicons so a refresh re-attempts them", async () => {
      clearFaviconCache();
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      setFaviconCacheEntry("https://failed.example.com", -1, Date.now());
      setFaviconCacheEntry("https://ok.example.com", 1, Date.now());

      await useFeedStore.getState().refreshAll();

      // Failed entry dropped → next render restarts from the first strategy.
      expect(getFaviconStrategyIndex("https://failed.example.com")).toBe(0);
      // A working favicon is left untouched.
      expect(getFaviconStrategyIndex("https://ok.example.com")).toBe(1);
    });

    it("kicks off background prefetch when the offline-prefetch gate is open", async () => {
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().refreshAll();

      expect(prefetchStarredArticles).toHaveBeenCalled();
    });

    it("does not kick off background prefetch when the user is gate-locked", async () => {
      // Free user, paid tier active → tier-locked for offline-prefetch.
      useLicenseStore.setState({ tier: "free", verifying: false });
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().refreshAll();

      expect(prefetchStarredArticles).not.toHaveBeenCalled();
    });
  });

  describe("refreshFeed", () => {
    it("refreshes a single feed and reloads articles", async () => {
      const feed = mockFeed("f1", "Feed 1");
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });
      vi.mocked(refreshFeed).mockResolvedValue({
        ok: true,
        value: { newCount: 2, updatedCount: 0 },
      });

      await useFeedStore.getState().refreshSingleFeed("f1");

      expect(getFeed).toHaveBeenCalledWith("f1");
      expect(refreshFeed).toHaveBeenCalledWith(feed);
    });

    it("ignores a second concurrent refresh of the same feed so articles aren't inserted twice", async () => {
      const feed = mockFeed("f1", "Feed 1");
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });

      let resolveRefresh!: (value: {
        ok: true;
        value: { newCount: number; updatedCount: number };
      }) => void;
      vi.mocked(refreshFeed).mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const first = useFeedStore.getState().refreshSingleFeed("f1");
      const second = useFeedStore.getState().refreshSingleFeed("f1");

      resolveRefresh({ ok: true, value: { newCount: 2, updatedCount: 0 } });
      await Promise.all([first, second]);

      expect(refreshFeed).toHaveBeenCalledTimes(1);
    });
  });

  describe("reloadSingleFeed", () => {
    it("ignores a second concurrent reload of the same feed so articles aren't inserted twice", async () => {
      const feed = mockFeed("f1", "Feed 1");
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });

      let resolveReload!: (value: {
        ok: true;
        value: { articleCount: number };
      }) => void;
      vi.mocked(reloadFeed).mockReturnValue(
        new Promise((resolve) => {
          resolveReload = resolve;
        }),
      );

      const first = useFeedStore.getState().reloadSingleFeed("f1");
      const second = useFeedStore.getState().reloadSingleFeed("f1");

      resolveReload({ ok: true, value: { articleCount: 5 } });
      await Promise.all([first, second]);

      expect(reloadFeed).toHaveBeenCalledTimes(1);
    });
  });

  describe("refreshView", () => {
    it("refreshes only the viewed feed when a concrete feed is selected", async () => {
      const f1 = mockFeed("f1", "Feed 1");
      const f2 = mockFeed("f2", "Feed 2");
      useFeedStore.setState({ feeds: [f1, f2] });
      vi.mocked(refreshFeed).mockResolvedValue({
        ok: true,
        value: { newCount: 1, updatedCount: 0 },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1, f2] });

      await useFeedStore.getState().refreshView("f1");

      expect(refreshFeed).toHaveBeenCalledTimes(1);
      expect(refreshFeed).toHaveBeenCalledWith(f1);
      expect(refreshAllFeeds).not.toHaveBeenCalled();
    });

    it("refreshes only the folder's member feeds when a folder is viewed", async () => {
      const f1 = { ...mockFeed("f1", "Feed 1"), folderId: "tech" };
      const f2 = { ...mockFeed("f2", "Feed 2"), folderId: "tech" };
      const f3 = mockFeed("f3", "Feed 3");
      useFeedStore.setState({ feeds: [f1, f2, f3] });
      vi.mocked(refreshFeed).mockResolvedValue({
        ok: true,
        value: { newCount: 0, updatedCount: 0 },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1, f2, f3] });

      await useFeedStore.getState().refreshView(toFolderFeedId("tech"));

      expect(refreshFeed).toHaveBeenCalledTimes(2);
      expect(refreshFeed).toHaveBeenCalledWith(f1);
      expect(refreshFeed).toHaveBeenCalledWith(f2);
      expect(refreshFeed).not.toHaveBeenCalledWith(f3);
      expect(refreshAllFeeds).not.toHaveBeenCalled();
    });

    it("refreshes every feed when an aggregated view (all items) is selected", async () => {
      const f1 = mockFeed("f1", "Feed 1");
      useFeedStore.setState({ feeds: [f1] });
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1] });

      await useFeedStore.getState().refreshView(ALL_FEEDS_ID);

      expect(refreshAllFeeds).toHaveBeenCalled();
      expect(refreshFeed).not.toHaveBeenCalled();
    });

    it("reloads the viewed feed's articles so new items appear in place", async () => {
      const f1 = mockFeed("f1", "Feed 1");
      useFeedStore.setState({ feeds: [f1] });
      vi.mocked(refreshFeed).mockResolvedValue({
        ok: true,
        value: { newCount: 1, updatedCount: 0 },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1] });

      await useFeedStore.getState().refreshView("f1");

      expect(getArticles).toHaveBeenCalledWith("f1");
    });

    it("only stamps lastRefreshAllAt on a full refresh, not a scoped one", async () => {
      const f1 = mockFeed("f1", "Feed 1");
      useFeedStore.setState({ feeds: [f1], lastRefreshAllAt: null });
      vi.mocked(refreshFeed).mockResolvedValue({
        ok: true,
        value: { newCount: 0, updatedCount: 0 },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1] });

      await useFeedStore.getState().refreshView("f1");

      // A single-feed refresh must not reset the all-feeds staleness clock,
      // otherwise the background auto-refresh would skip a needed full pass.
      expect(useFeedStore.getState().lastRefreshAllAt).toBeNull();
    });

    it("no-ops while a refresh is already in flight", async () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Feed 1")],
        isRefreshingAll: true,
      });

      await useFeedStore.getState().refreshView("f1");

      expect(refreshFeed).not.toHaveBeenCalled();
      expect(refreshAllFeeds).not.toHaveBeenCalled();
    });
  });

  describe("pull-before-refresh", () => {
    it("pulls sync blob before refreshing for sync users", async () => {
      const callOrder: string[] = [];
      const pullSpy = vi
        .spyOn(useSyncStore.getState(), "pull")
        .mockImplementation(async () => {
          callOrder.push("pull");
        });
      vi.mocked(refreshAllFeeds).mockImplementation(async () => {
        callOrder.push("refreshAllFeeds");
        return { ok: true, value: { results: [] } };
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      useSyncStore.setState({
        credentials: { vaultId: "v", vaultKey: "k" as unknown as CryptoKey },
      });

      await useFeedStore.getState().refreshAll();

      expect(pullSpy).toHaveBeenCalled();
      expect(callOrder.indexOf("pull")).toBeLessThan(
        callOrder.indexOf("refreshAllFeeds"),
      );
      pullSpy.mockRestore();
    });

    it("does not pull for local-only users", async () => {
      const pullSpy = vi.spyOn(useSyncStore.getState(), "pull");
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      useSyncStore.setState({ credentials: null });

      await useFeedStore.getState().refreshAll();

      expect(pullSpy).not.toHaveBeenCalled();
      pullSpy.mockRestore();
    });

    it("reloads feeds from DB after pull before refreshing", async () => {
      const callOrder: string[] = [];
      const newFeed = mockFeed("pulled", "Pulled Feed");
      let getFeedsCallCount = 0;

      vi.spyOn(useSyncStore.getState(), "pull").mockImplementation(async () => {
        callOrder.push("pull");
      });
      vi.mocked(getFeeds).mockImplementation(async () => {
        getFeedsCallCount++;
        callOrder.push(`getFeeds-${getFeedsCallCount}`);
        if (getFeedsCallCount === 1) {
          return { ok: true, value: [newFeed] };
        }
        return { ok: true, value: [newFeed] };
      });
      vi.mocked(refreshAllFeeds).mockImplementation(async () => {
        callOrder.push("refreshAllFeeds");
        return { ok: true, value: { results: [] } };
      });
      useSyncStore.setState({
        credentials: { vaultId: "v", vaultKey: "k" as unknown as CryptoKey },
      });

      await useFeedStore.getState().refreshAll();

      // After pull, getFeeds should be called to load pulled feeds,
      // then refreshAllFeeds, then getFeeds again for final state
      expect(callOrder).toEqual([
        "pull",
        "getFeeds-1",
        "refreshAllFeeds",
        "getFeeds-2",
      ]);
    });
  });

  describe("sync triggers", () => {
    let scheduleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");
    });

    it("schedules sync push after addFeed succeeds", async () => {
      const feed = mockFeed("new", "New Feed");
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: true,
        value: { feed, articles: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });

      await useFeedStore.getState().addFeed("https://new.com/feed");

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("does not schedule sync push after addFeed fails", async () => {
      vi.mocked(addFeedFlow).mockResolvedValue({ ok: false, error: "bad" });

      await useFeedStore.getState().addFeed("https://bad.com");

      expect(scheduleSpy).not.toHaveBeenCalled();
    });

    it("schedules sync push after removeFeed succeeds", async () => {
      useFeedStore.setState({
        feeds: [mockFeed("x", "X")],
        selectedFeedId: "x",
      });
      vi.mocked(removeFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().removeFeed("x");

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("schedules sync push after refreshAll completes", async () => {
      vi.mocked(refreshAllFeeds).mockResolvedValue({
        ok: true,
        value: { results: [] },
      });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().refreshAll();

      expect(scheduleSpy).toHaveBeenCalled();
    });
  });

  describe("createFolder", () => {
    it("creates a folder and reloads folder list", async () => {
      const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
      vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [folder] });

      await useFeedStore.getState().createFolder("Tech");

      expect(addFolder).toHaveBeenCalledWith(expect.objectContaining({ name: "Tech" }));
      expect(useFeedStore.getState().folders).toHaveLength(1);
      expect(useFeedStore.getState().folders[0].name).toBe("Tech");
    });

    it("auto-assigns a color to the new folder", async () => {
      vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().createFolder("Tech");

      const call = vi.mocked(addFolder).mock.calls[0][0];
      expect(call.color).toBeDefined();
      expect(call.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe("renameFolder", () => {
    it("renames a folder and reloads", async () => {
      const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
      useFeedStore.setState({ folders: [folder] });
      vi.mocked(updateFolder).mockResolvedValue({ ok: true, value: true });
      const renamed = { ...folder, name: "Technology" };
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [renamed] });

      await useFeedStore.getState().renameFolder("folder-1", "Technology");

      expect(updateFolder).toHaveBeenCalledWith(expect.objectContaining({ name: "Technology" }));
      expect(useFeedStore.getState().folders[0].name).toBe("Technology");
    });
  });

  describe("deleteFolder", () => {
    it("unfiles feeds and removes folder", async () => {
      const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
      const feed = { ...mockFeed("f1", "Feed"), folderId: "folder-1" };
      useFeedStore.setState({ feeds: [feed], folders: [folder] });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(removeFolder).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [{ ...feed, folderId: undefined }] });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().deleteFolder("folder-1");

      expect(updateFeed).toHaveBeenCalledWith(expect.objectContaining({ folderId: undefined }));
      expect(removeFolder).toHaveBeenCalledWith("folder-1");
      expect(useFeedStore.getState().folders).toHaveLength(0);
    });
  });

  describe("moveFeedToFolder", () => {
    it("moves a feed into a folder", async () => {
      const feed = mockFeed("f1", "Feed");
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      const moved = { ...feed, folderId: "folder-1" };
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [moved] });

      await useFeedStore.getState().moveFeedToFolder("f1", "folder-1");

      expect(updateFeed).toHaveBeenCalledWith(expect.objectContaining({ folderId: "folder-1" }));
    });

    it("moves a feed out of a folder (unfiled)", async () => {
      const feed = { ...mockFeed("f1", "Feed"), folderId: "folder-1" };
      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: feed });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [{ ...feed, folderId: undefined }] });

      await useFeedStore.getState().moveFeedToFolder("f1", null);

      expect(updateFeed).toHaveBeenCalledWith(expect.objectContaining({ folderId: undefined }));
    });
  });

  describe("applyAutoOrganize", () => {
    it("creates a folder per non-empty topic and moves the feeds in", async () => {
      const f1 = mockFeed("f1", "Hacker News");
      const f2 = mockFeed("f2", "Bloomberg");
      useFeedStore.setState({ feeds: [f1, f2], folders: [] });

      vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(getFeed).mockImplementation(async (id) => ({
        ok: true,
        value: id === "f1" ? f1 : f2,
      }));
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1, f2] });

      await useFeedStore.getState().applyAutoOrganize([
        { folderName: "Tech", feedIds: ["f1"] },
        { folderName: "Business", feedIds: ["f2"] },
      ]);

      // Two folders created, one per non-empty topic. Capture their generated ids.
      const addFolderCalls = vi.mocked(addFolder).mock.calls;
      expect(addFolderCalls).toHaveLength(2);
      const techCall = addFolderCalls.find((c) => c[0].name === "Tech");
      const bizCall = addFolderCalls.find((c) => c[0].name === "Business");
      expect(techCall).toBeDefined();
      expect(bizCall).toBeDefined();
      const techId = techCall![0].id;
      const bizId = bizCall![0].id;

      // Each feed is moved into the folder created for its topic.
      expect(updateFeed).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f1", folderId: techId }),
      );
      expect(updateFeed).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f2", folderId: bizId }),
      );
    });

    it("reuses an existing folder with the same name (case-insensitive)", async () => {
      const existing = { id: "fold-tech", name: "Tech", createdAt: 0 };
      const f1 = mockFeed("f1", "Hacker News");
      useFeedStore.setState({ feeds: [f1], folders: [existing] });

      vi.mocked(getFeed).mockResolvedValue({ ok: true, value: f1 });
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [{ ...f1, folderId: "fold-tech" }],
      });
      vi.mocked(getFolders).mockResolvedValue({
        ok: true,
        value: [existing],
      });

      await useFeedStore.getState().applyAutoOrganize([
        { folderName: "tech", feedIds: ["f1"] },
      ]);

      // Reused — no new folder created.
      expect(addFolder).not.toHaveBeenCalled();
      expect(updateFeed).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f1", folderId: "fold-tech" }),
      );
    });

    it("auto-assigns a color to each new folder", async () => {
      const f1 = mockFeed("f1", "Hacker News");
      const f2 = mockFeed("f2", "Bloomberg");
      useFeedStore.setState({ feeds: [f1, f2], folders: [] });

      vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(getFeed).mockImplementation(async (id) => ({
        ok: true,
        value: id === "f1" ? f1 : f2,
      }));
      vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1, f2] });

      await useFeedStore.getState().applyAutoOrganize([
        { folderName: "Tech", feedIds: ["f1"] },
        { folderName: "Business", feedIds: ["f2"] },
      ]);

      const calls = vi.mocked(addFolder).mock.calls;
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call[0].color).toBeDefined();
        expect(call[0].color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it("skips empty topics (no folder created, no feeds moved)", async () => {
      useFeedStore.setState({ feeds: [], folders: [] });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });

      await useFeedStore.getState().applyAutoOrganize([
        { folderName: "Tech", feedIds: [] },
      ]);

      expect(addFolder).not.toHaveBeenCalled();
      expect(updateFeed).not.toHaveBeenCalled();
    });

    describe("feature gating", () => {
      it("no-ops and toasts when tier is free and not self-hosted", async () => {
        useLicenseStore.setState({ tier: "free" });
        const f1 = mockFeed("f1", "Hacker News");
        useFeedStore.setState({ feeds: [f1], folders: [] });

        await useFeedStore.getState().applyAutoOrganize([
          { folderName: "Tech", feedIds: ["f1"] },
        ]);

        expect(addFolder).not.toHaveBeenCalled();
        expect(updateFeed).not.toHaveBeenCalled();
        // Matrix-derived upgrade copy: references the feature name + tier.
        expect(toast).toHaveBeenCalledWith(
          expect.stringMatching(/unlock Auto-organize/i),
        );
      });

      it("runs normally when tier is free but self-hosted is enabled", async () => {
        useLicenseStore.setState({ tier: "free" });
        vi.mocked(isSelfHosted).mockReturnValue(true);

        const f1 = mockFeed("f1", "Hacker News");
        useFeedStore.setState({ feeds: [f1], folders: [] });
        vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
        vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });
        vi.mocked(getFeed).mockResolvedValue({ ok: true, value: f1 });
        vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
        vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1] });

        await useFeedStore.getState().applyAutoOrganize([
          { folderName: "Tech", feedIds: ["f1"] },
        ]);

        expect(addFolder).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
      });

      it("runs normally for free user when the paid tier is inactive (pre-launch)", async () => {
        useLicenseStore.setState({ tier: "free" });
        vi.mocked(isPaidTierActive).mockReturnValue(false);

        const f1 = mockFeed("f1", "Hacker News");
        useFeedStore.setState({ feeds: [f1], folders: [] });
        vi.mocked(addFolder).mockResolvedValue({ ok: true, value: true });
        vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [] });
        vi.mocked(getFeed).mockResolvedValue({ ok: true, value: f1 });
        vi.mocked(updateFeed).mockResolvedValue({ ok: true, value: true });
        vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [f1] });

        await useFeedStore.getState().applyAutoOrganize([
          { folderName: "Tech", feedIds: ["f1"] },
        ]);

        expect(addFolder).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
      });
    });
  });

  describe("loadFeeds loads folders too", () => {
    it("loads feeds and folders in parallel", async () => {
      const feed = mockFeed("f1", "Feed");
      const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [feed] });
      vi.mocked(getFolders).mockResolvedValue({ ok: true, value: [folder] });

      await useFeedStore.getState().loadFeeds();

      expect(useFeedStore.getState().feeds).toHaveLength(1);
      expect(useFeedStore.getState().folders).toHaveLength(1);
      expect(useFeedStore.getState().folders[0].name).toBe("Tech");
    });
  });

  describe("release notes feed sorting", () => {
    // The app auto-subscribes to https://feedzero.app/releases.xml and pins it
    // to the top of the sidebar so users always see "What's new" first.
    // This describes observable behavior: after loadFeeds, the release feed is
    // always index 0 regardless of its position in the db result.
    const releaseFeed = {
      id: "release",
      url: "https://feedzero.app/releases.xml",
      title: "FeedZero Release Notes",
      description: "",
      siteUrl: "https://feedzero.app/releases/",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("pins the external release feed to index 0", async () => {
      const a = mockFeed("a", "Ars Technica");
      const z = mockFeed("z", "Zero Hedge");
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [a, z, releaseFeed],
      });

      await useFeedStore.getState().loadFeeds();

      const feeds = useFeedStore.getState().feeds;
      expect(feeds[0]?.url).toBe("https://feedzero.app/releases.xml");
    });

    it("keeps non-release feeds sorted alphabetically after the release feed", async () => {
      const ars = mockFeed("ars", "Ars Technica");
      const verge = mockFeed("verge", "The Verge");
      const bbc = mockFeed("bbc", "BBC News");
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [verge, ars, releaseFeed, bbc],
      });

      await useFeedStore.getState().loadFeeds();

      const titles = useFeedStore.getState().feeds.map((f) => f.title);
      expect(titles).toEqual([
        "FeedZero Release Notes",
        "Ars Technica",
        "BBC News",
        "The Verge",
      ]);
    });

    it("does not treat the legacy same-origin changelog path as a release feed", async () => {
      // After the migration, /api/changelog.xml is a regular URL with no
      // special meaning. A feed with that URL should sort alphabetically,
      // not pin to top.
      const legacy = {
        ...mockFeed("legacy", "Legacy Changelog"),
        url: "https://example.com/api/changelog.xml",
      };
      const ars = mockFeed("ars", "Ars Technica");
      vi.mocked(getFeeds).mockResolvedValue({
        ok: true,
        value: [legacy, ars],
      });

      await useFeedStore.getState().loadFeeds();

      const titles = useFeedStore.getState().feeds.map((f) => f.title);
      expect(titles).toEqual(["Ars Technica", "Legacy Changelog"]);
    });
  });

  describe("selectFeedsById selector", () => {
    it("returns a map of feedId to feed", () => {
      const feed1 = mockFeed("f1", "Feed One");
      const feed2 = mockFeed("f2", "Feed Two");
      useFeedStore.setState({ feeds: [feed1, feed2] });

      const byId = selectFeedsById(useFeedStore.getState());

      expect(byId["f1"].title).toBe("Feed One");
      expect(byId["f2"].title).toBe("Feed Two");
    });

    it("returns empty object when no feeds", () => {
      useFeedStore.setState({ feeds: [] });

      const byId = selectFeedsById(useFeedStore.getState());

      expect(byId).toEqual({});
    });
  });

  describe("feed sort mode", () => {
    const LS_SORT_MODE = "feedzero:feed-sort-mode";
    const LS_FEED_ORDER = "feedzero:feed-custom-order";
    const LS_FOLDER_ORDER = "feedzero:folder-custom-order";

    beforeEach(() => {
      localStorageMock.clear();
      // Re-initialize sort mode from now-empty storage
      useFeedStore.setState({ feedSortMode: "name", feedCustomOrder: [], folderCustomOrder: [] });
    });

    it("defaults to 'name' sort mode", () => {
      expect(useFeedStore.getState().feedSortMode).toBe("name");
    });

    it("setFeedSortMode updates state", () => {
      useFeedStore.getState().setFeedSortMode("count");
      expect(useFeedStore.getState().feedSortMode).toBe("count");
    });

    it("setFeedSortMode persists to localStorage", () => {
      useFeedStore.getState().setFeedSortMode("custom");
      expect(localStorage.getItem(LS_SORT_MODE)).toBe("custom");
    });

    it("reorderFeeds updates feedCustomOrder", () => {
      useFeedStore.getState().reorderFeeds(["f3", "f1", "f2"]);
      expect(useFeedStore.getState().feedCustomOrder).toEqual(["f3", "f1", "f2"]);
    });

    it("reorderFeeds persists to localStorage as JSON", () => {
      useFeedStore.getState().reorderFeeds(["f2", "f1"]);
      expect(localStorage.getItem(LS_FEED_ORDER)).toBe(JSON.stringify(["f2", "f1"]));
    });

    it("reorderFolders updates folderCustomOrder", () => {
      useFeedStore.getState().reorderFolders(["folder-b", "folder-a"]);
      expect(useFeedStore.getState().folderCustomOrder).toEqual(["folder-b", "folder-a"]);
    });

    it("reorderFolders persists to localStorage as JSON", () => {
      useFeedStore.getState().reorderFolders(["folder-b", "folder-a"]);
      expect(localStorage.getItem(LS_FOLDER_ORDER)).toBe(JSON.stringify(["folder-b", "folder-a"]));
    });
  });
});
