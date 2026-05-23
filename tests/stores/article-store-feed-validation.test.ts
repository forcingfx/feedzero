import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import type { Article } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const mockArticle = (id: string, feedId: string): Article => ({
  id,
  feedId,
  guid: id,
  title: "Test Article",
  link: "https://example.com/article",
  content: "<p>Content</p>",
  summary: "Summary",
  author: "Author",
  publishedAt: Date.now(),
  read: false,
  createdAt: Date.now(),
});

describe("Article store feed validation", () => {
  beforeEach(() => {
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });
  });

  it("rejects article selection when feedId mismatch", async () => {
    useFeedStore.setState({ selectedFeedId: "feed-A" });
    const articleFromFeedB = mockArticle("article-1", "feed-B");

    await useArticleStore.getState().selectArticle(articleFromFeedB);

    expect(useArticleStore.getState().selectedArticle).toBeNull();
  });

  it("accepts article selection when feedId matches", async () => {
    useFeedStore.setState({ selectedFeedId: "feed-A" });
    const articleFromFeedA = mockArticle("article-1", "feed-A");

    await useArticleStore.getState().selectArticle(articleFromFeedA);

    const selected = useArticleStore.getState().selectedArticle;
    expect(selected).toBeTruthy();
    expect(selected?.id).toBe("article-1");
    expect(selected?.feedId).toBe("feed-A");
  });

  it("accepts article selection when no feed is selected", async () => {
    // No feed selected yet
    useFeedStore.setState({ selectedFeedId: null });
    const article = mockArticle("article-1", "feed-A");

    await useArticleStore.getState().selectArticle(article);

    // Should allow selection when no feed constraint exists
    const selected = useArticleStore.getState().selectedArticle;
    expect(selected).toBeTruthy();
    expect(selected?.id).toBe("article-1");
    expect(selected?.feedId).toBe("feed-A");
  });

  it("clears selectedArticle when explicitly set to null", async () => {
    const article = mockArticle("article-1", "feed-A");
    useArticleStore.setState({ selectedArticle: article });

    await useArticleStore.getState().selectArticle(null);

    expect(useArticleStore.getState().selectedArticle).toBeNull();
  });
});
