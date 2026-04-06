import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  getAllArticles: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import {
  getArticles,
  getAllArticles,
  updateArticle,
} from "../../src/core/storage/db.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "../../src/utils/constants.ts";

const mockArticle = (id: string, read = false) => ({
  id,
  feedId: "f1",
  guid: id,
  title: `Article ${id}`,
  link: `https://example.com/${id}`,
  content: "<p>content</p>",
  summary: "summary",
  author: "author",
  publishedAt: Date.now(),
  read,
  createdAt: Date.now(),
});

describe("article-store", () => {
  beforeEach(() => {
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  describe("loadArticles", () => {
    it("loads articles for a feed", async () => {
      const articles = [mockArticle("a1"), mockArticle("a2")];
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: articles });

      await useArticleStore.getState().loadArticles("f1");

      expect(getArticles).toHaveBeenCalledWith("f1");
      expect(useArticleStore.getState().articles).toEqual(articles);
    });

    it("clears articles on failure", async () => {
      useArticleStore.setState({ articles: [mockArticle("old")] });
      vi.mocked(getArticles).mockResolvedValue({ ok: false, error: "fail" });

      await useArticleStore.getState().loadArticles("f1");

      expect(useArticleStore.getState().articles).toEqual([]);
    });

    it("clears old articles immediately when switching feeds", async () => {
      const oldArticles = [mockArticle("old-a1"), mockArticle("old-a2")];
      oldArticles.forEach((a) => (a.feedId = "feed-A"));
      useArticleStore.setState({ articles: oldArticles });

      let resolveGetArticles: (value: {
        ok: true;
        value: typeof oldArticles;
      }) => void;
      vi.mocked(getArticles).mockReturnValue(
        new Promise((resolve) => {
          resolveGetArticles = resolve;
        }),
      );

      const loadPromise = useArticleStore.getState().loadArticles("feed-B");

      // Old articles cleared immediately (no stale content from wrong feed)
      expect(useArticleStore.getState().articles).toEqual([]);
      expect(useArticleStore.getState().selectedArticle).toBeNull();
      expect(useArticleStore.getState().isLoading).toBe(true);

      const newArticles = [mockArticle("new-b1")];
      newArticles[0].feedId = "feed-B";
      resolveGetArticles!({ ok: true, value: newArticles });
      await loadPromise;

      expect(useArticleStore.getState().articles).toEqual(newArticles);
      expect(useArticleStore.getState().isLoading).toBe(false);
    });
  });

  describe("selectArticle", () => {
    it("sets selected article immediately but delays mark-as-read", async () => {
      vi.useFakeTimers();
      const article = mockArticle("a1", false);
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(article);

      // Immediately selected but still unread
      expect(useArticleStore.getState().selectedArticle).toEqual(article);
      expect(updateArticle).not.toHaveBeenCalled();

      // After 3 seconds, marked as read
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(useArticleStore.getState().selectedArticle).toEqual({
        ...article,
        read: true,
      });
      expect(updateArticle).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("does not update db if already read", async () => {
      const article = mockArticle("a1", true);

      await useArticleStore.getState().selectArticle(article);

      expect(useArticleStore.getState().selectedArticle).toEqual(article);
      expect(updateArticle).not.toHaveBeenCalled();
    });

    it("flushes pending mark-as-read when selecting a different article", async () => {
      vi.useFakeTimers();
      const article1 = mockArticle("a1", false);
      const article2 = mockArticle("a2", false);
      useArticleStore.setState({ articles: [article1, article2] });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      // Select first article (starts 1s timer)
      await useArticleStore.getState().selectArticle(article1);
      expect(useArticleStore.getState().selectedArticle).toEqual(article1);

      // Switch to second article before timer fires
      await useArticleStore.getState().selectArticle(article2);

      // First article should be marked read immediately (flushed)
      const articles = useArticleStore.getState().articles;
      expect(articles.find((a) => a.id === "a1")?.read).toBe(true);
      expect(updateArticle).toHaveBeenCalledWith({ ...article1, read: true });

      vi.useRealTimers();
    });

    it("flushes pending mark-as-read when deselecting with null", async () => {
      vi.useFakeTimers();
      const article = mockArticle("a1", false);
      useArticleStore.setState({ articles: [article] });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(article);
      await useArticleStore.getState().selectArticle(null);

      // Article should be marked read (flushed, not cancelled)
      const articles = useArticleStore.getState().articles;
      expect(articles.find((a) => a.id === "a1")?.read).toBe(true);

      vi.useRealTimers();
    });

    it("sets null to deselect", async () => {
      useArticleStore.setState({ selectedArticle: mockArticle("a1") });

      await useArticleStore.getState().selectArticle(null);

      expect(useArticleStore.getState().selectedArticle).toBeNull();
    });
  });

  describe("markAsRead", () => {
    it("marks article as read in the list", async () => {
      const articles = [mockArticle("a1", false), mockArticle("a2", false)];
      useArticleStore.setState({ articles });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().markAsRead("a1");

      const updated = useArticleStore.getState().articles;
      expect(updated[0].read).toBe(true);
      expect(updated[1].read).toBe(false);
    });
  });

  describe("markAllAsRead", () => {
    it("marks all unread articles as read", async () => {
      const articles = [
        mockArticle("a1", false),
        mockArticle("a2", false),
        mockArticle("a3", true),
      ];
      useArticleStore.setState({ articles });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().markAllAsRead();

      const updated = useArticleStore.getState().articles;
      expect(updated.every((a) => a.read)).toBe(true);
      // Only unread articles should be persisted
      expect(updateArticle).toHaveBeenCalledTimes(2);
    });

    it("does nothing when all articles are read", async () => {
      const articles = [mockArticle("a1", true), mockArticle("a2", true)];
      useArticleStore.setState({ articles });

      await useArticleStore.getState().markAllAsRead();

      expect(updateArticle).not.toHaveBeenCalled();
    });
  });

  describe("sync triggers", () => {
    let scheduleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");
    });

    it("schedules sync push after selectArticle marks as read", async () => {
      vi.useFakeTimers();
      const article = mockArticle("a1", false);
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(article);

      // Sync not triggered yet (read is delayed)
      expect(scheduleSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(scheduleSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("does not schedule sync push when article is already read", async () => {
      const article = mockArticle("a1", true);

      await useArticleStore.getState().selectArticle(article);

      expect(scheduleSpy).not.toHaveBeenCalled();
    });
  });

  describe("global view (ALL_FEEDS_ID)", () => {
    it("loadArticles calls getAllArticles when feedId is ALL_FEEDS_ID", async () => {
      const articleFromFeed1 = { ...mockArticle("a1"), feedId: "feed-1" };
      const articleFromFeed2 = { ...mockArticle("a2"), feedId: "feed-2" };
      vi.mocked(getAllArticles).mockResolvedValue({
        ok: true,
        value: [articleFromFeed1, articleFromFeed2],
      });

      await useArticleStore.getState().loadArticles(ALL_FEEDS_ID);

      expect(getAllArticles).toHaveBeenCalled();
      expect(getArticles).not.toHaveBeenCalled();
      expect(useArticleStore.getState().articles).toHaveLength(2);
    });

    it("selectArticle allows any feedId when selectedFeedId is ALL_FEEDS_ID", async () => {
      useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
      const articleFromDifferentFeed = {
        ...mockArticle("a1"),
        feedId: "some-other-feed",
      };
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(articleFromDifferentFeed);

      expect(useArticleStore.getState().selectedArticle).not.toBeNull();
      expect(useArticleStore.getState().selectedArticle?.feedId).toBe(
        "some-other-feed",
      );
    });
  });
});
