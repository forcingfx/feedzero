import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { getArticles, updateArticle } from "../../src/core/storage/db.ts";

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

    it("clears old articles immediately before loading new ones", async () => {
      // Start with articles from feed A
      const oldArticles = [mockArticle("old-a1"), mockArticle("old-a2")];
      oldArticles.forEach((a) => (a.feedId = "feed-A"));
      useArticleStore.setState({ articles: oldArticles });

      // Set up a delayed response to simulate network latency
      let resolveGetArticles: (value: {
        ok: true;
        value: typeof oldArticles;
      }) => void;
      vi.mocked(getArticles).mockReturnValue(
        new Promise((resolve) => {
          resolveGetArticles = resolve;
        }),
      );

      // Start loading articles for feed B (don't await)
      const loadPromise = useArticleStore.getState().loadArticles("feed-B");

      // IMMEDIATELY after calling loadArticles, articles should be cleared
      // This prevents showing old feed's articles with new feed's name
      expect(useArticleStore.getState().articles).toEqual([]);
      expect(useArticleStore.getState().isLoading).toBe(true);

      // Now resolve the fetch
      const newArticles = [mockArticle("new-b1")];
      newArticles[0].feedId = "feed-B";
      resolveGetArticles!({ ok: true, value: newArticles });
      await loadPromise;

      // After load completes, should have new articles
      expect(useArticleStore.getState().articles).toEqual(newArticles);
      expect(useArticleStore.getState().isLoading).toBe(false);
    });
  });

  describe("selectArticle", () => {
    it("sets selected article and marks as read", async () => {
      const article = mockArticle("a1", false);
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(article);

      const state = useArticleStore.getState();
      expect(state.selectedArticle).toEqual({ ...article, read: true });
      expect(updateArticle).toHaveBeenCalled();
    });

    it("does not update db if already read", async () => {
      const article = mockArticle("a1", true);

      await useArticleStore.getState().selectArticle(article);

      expect(useArticleStore.getState().selectedArticle).toEqual(article);
      expect(updateArticle).not.toHaveBeenCalled();
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

  describe("sync triggers", () => {
    let scheduleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");
    });

    it("schedules sync push after selectArticle marks as read", async () => {
      const article = mockArticle("a1", false);
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(article);

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("does not schedule sync push when article is already read", async () => {
      const article = mockArticle("a1", true);

      await useArticleStore.getState().selectArticle(article);

      expect(scheduleSpy).not.toHaveBeenCalled();
    });
  });
});
