import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useSmartFilterStore } from "../../src/stores/smart-filter-store.ts";
import { toFilterFeedId } from "@feedzero/core/utils/constants";
import type {
  Article,
  Feed,
  SmartFilter,
} from "@feedzero/core/types";

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

import { getAllArticles, getArticles } from "../../src/core/storage/db.ts";

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-1",
    url: "https://x.com/rss",
    title: "X",
    description: "",
    siteUrl: "https://x.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    feedId: "feed-1",
    guid: "g",
    title: "T",
    link: "https://x.com/a/1",
    content: "",
    summary: "",
    author: "",
    publishedAt: Date.now(),
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

function filter(overrides: Partial<SmartFilter> = {}): SmartFilter {
  return {
    id: "filter-1",
    name: "f",
    rule: { kind: "group", match: "all", children: [] },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("article-store — filter virtual feed (FILTER_FEED_PREFIX)", () => {
  beforeEach(() => {
    useArticleStore.setState({
      articles: [],
      articlesByFeedId: {},
      selectedArticle: null,
      isLoading: false,
      articleSortMode: "newest",
    });
    useFeedStore.setState({
      feeds: [feed({ id: "feed-1" }), feed({ id: "feed-2" })],
      folders: [],
      selectedFeedId: null,
    });
    useSmartFilterStore.setState({ filters: [] });
    vi.clearAllMocks();
  });

  it("loadArticles(toFilterFeedId(id)) runs the bulk getAllArticles path", async () => {
    useSmartFilterStore.setState({ filters: [filter({ id: "F" })] });
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: [] });

    await useArticleStore.getState().loadArticles(toFilterFeedId("F"));

    expect(getAllArticles).toHaveBeenCalled();
    expect(getArticles).not.toHaveBeenCalled();
  });

  it("derives only articles that match the filter's rule", async () => {
    const a1 = article({
      id: "a1",
      feedId: "feed-1",
      title: "AI breakthrough",
      read: false,
    });
    const a2 = article({
      id: "a2",
      feedId: "feed-2",
      title: "Soccer scores",
      read: false,
    });
    const a3 = article({
      id: "a3",
      feedId: "feed-1",
      title: "More AI news",
      read: true,
    });

    useSmartFilterStore.setState({
      filters: [
        filter({
          id: "F",
          rule: {
            kind: "group",
            match: "all",
            children: [
              { kind: "title", op: "contains", value: "AI" },
              { kind: "read", op: "is", value: false },
            ],
          },
        }),
      ],
    });
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [a1, a2, a3],
    });

    await useArticleStore.getState().loadArticles(toFilterFeedId("F"));

    const visible = useArticleStore.getState().articles;
    expect(visible.map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns an empty list (no error) when the filter id is unknown", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [article()],
    });

    await useArticleStore
      .getState()
      .loadArticles(toFilterFeedId("missing-filter"));

    expect(useArticleStore.getState().articles).toEqual([]);
  });

  it("respects filter.limit when set", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      article({ id: `a${i}`, title: `AI ${i}`, publishedAt: 100 + i }),
    );
    useSmartFilterStore.setState({
      filters: [
        filter({
          id: "F",
          limit: 5,
          rule: {
            kind: "group",
            match: "all",
            children: [{ kind: "title", op: "contains", value: "AI" }],
          },
        }),
      ],
    });
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: many });

    await useArticleStore.getState().loadArticles(toFilterFeedId("F"));

    expect(useArticleStore.getState().articles).toHaveLength(5);
  });

  it("uses filter.sortMode override when set", async () => {
    const articles = [
      article({ id: "old", title: "AI", publishedAt: 100 }),
      article({ id: "new", title: "AI", publishedAt: 200 }),
    ];
    useSmartFilterStore.setState({
      filters: [
        filter({
          id: "F",
          sortMode: "oldest",
          rule: {
            kind: "group",
            match: "all",
            children: [{ kind: "title", op: "contains", value: "AI" }],
          },
        }),
      ],
    });
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: articles,
    });

    await useArticleStore.getState().loadArticles(toFilterFeedId("F"));

    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual([
      "old",
      "new",
    ]);
  });

  it("selectArticle accepts cross-feed selection when selectedFeedId is a filter feed", async () => {
    useFeedStore.setState({ selectedFeedId: toFilterFeedId("F") });
    const a = article({ feedId: "any-other-feed" });

    await useArticleStore.getState().selectArticle(a);

    expect(useArticleStore.getState().selectedArticle?.feedId).toBe(
      "any-other-feed",
    );
  });
});
