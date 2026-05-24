/**
 * Tag-aggregated view: when the selected feed id is `tag:<name>`, the
 * article list shows every article from feeds whose `tags` includes
 * that name. Parallels the folder view.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { toTagFeedId } from "@feedzero/core/utils/constants";

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
  getAllArticles,
} from "../../src/core/storage/db.ts";
import type { Article, Feed } from "@feedzero/core/types";

function article(
  id: string,
  feedId: string,
  extras: Partial<Article> = {},
): Article {
  return {
    id,
    feedId,
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: 1_700_000_000_000 - parseInt(id.replace(/\D/g, ""), 10),
    read: false,
    createdAt: 0,
    ...extras,
  };
}

function feed(id: string, tags?: string[]): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    description: "",
    siteUrl: "",
    tags,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("article-store — tag-aggregated view", () => {
  beforeEach(() => {
    useArticleStore.setState({
      articles: [],
      articlesByFeedId: {},
      selectedArticle: null,
      isLoading: false,
      articleSortMode: "newest",
      showMuted: false,
    });
    useFeedStore.setState({
      feeds: [
        feed("tech-a", ["tech", "frontend"]),
        feed("tech-b", ["tech"]),
        feed("news-a", ["news"]),
        feed("untagged"),
      ],
      folders: [],
    });
  });

  it("shows only articles from feeds tagged with the requested label", async () => {
    const articles = {
      "tech-a": [article("a1", "tech-a"), article("a2", "tech-a")],
      "tech-b": [article("b1", "tech-b")],
      "news-a": [article("n1", "news-a")],
      untagged: [article("u1", "untagged")],
    };
    useArticleStore.setState({ articlesByFeedId: articles });
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: Object.values(articles).flat(),
    });

    await useArticleStore.getState().loadArticles(toTagFeedId("tech"));

    // articlesByFeedId is bulk-replaced for aggregated views; the
    // "visible" derivation is what's user-facing.
    const visible = useArticleStore
      .getState()
      .articles.map((a) => a.id)
      .sort();
    expect(visible).toEqual(["a1", "a2", "b1"]);
  });

  it("returns empty list when no feed has the requested tag", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: [] });
    await useArticleStore.getState().loadArticles(toTagFeedId("nope"));
    expect(useArticleStore.getState().articles).toEqual([]);
  });
});
