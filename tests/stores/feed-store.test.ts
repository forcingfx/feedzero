import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeedStore, selectFeedsById } from "../../src/stores/feed-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn(),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
}));

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { getFeeds, getFeed, removeFeed, updateFeed } from "../../src/core/storage/db.ts";
import {
  addFeedFlow,
  refreshFeed,
  refreshAllFeeds,
} from "../../src/core/feeds/feed-service.ts";

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
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
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

      expect(addFeedFlow).toHaveBeenCalledWith("https://new.com/feed", undefined);
      expect(useFeedStore.getState().feeds).toEqual([feed]);
      expect(useFeedStore.getState().selectedFeedId).toBe("new");
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

  describe("selectFeed", () => {
    it("sets selectedFeedId", () => {
      useFeedStore.getState().selectFeed("abc");
      expect(useFeedStore.getState().selectedFeedId).toBe("abc");
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
});
