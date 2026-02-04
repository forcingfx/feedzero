import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
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

import { getFeeds, getFeed, removeFeed } from "../../src/core/storage/db.ts";
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

      expect(addFeedFlow).toHaveBeenCalledWith("https://new.com/feed");
      expect(useFeedStore.getState().feeds).toEqual([feed]);
      expect(useFeedStore.getState().selectedFeedId).toBe("new");
    });

    it("sets error on failure", async () => {
      vi.mocked(addFeedFlow).mockResolvedValue({
        ok: false,
        error: "not a feed",
      });

      await useFeedStore.getState().addFeed("https://bad.com");

      expect(useFeedStore.getState().error).toBe("not a feed");
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
});
