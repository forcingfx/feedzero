/**
 * Article.folderId is set by the `route-to-folder` rule action. When
 * present, it overrides the article's feed-level folder for display
 * purposes — the article appears under the target folder, even if its
 * feed lives in a different folder (or no folder at all).
 *
 * This is what makes `route-to-folder` user-visible. Without
 * derivation honouring the override, the article would still be
 * persisted with the override but visually stay under its feed's
 * folder — the rule would look broken.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useArticleStore,
} from "../../src/stores/article-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { toFolderFeedId } from "@feedzero/core/utils/constants";

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

function feed(id: string, folderId?: string): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    description: "",
    siteUrl: "",
    folderId,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("folder view honours article-level folderId override", () => {
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
      // f-tech lives in folder-tech; f-news has no folder.
      feeds: [feed("f-tech", "folder-tech"), feed("f-news")],
      folders: [],
    });
    vi.mocked(getArticles).mockImplementation(async (feedId: string) => ({
      ok: true,
      value: useArticleStore.getState().articlesByFeedId[feedId] ?? [],
    }));
    vi.mocked(getAllArticles).mockImplementation(async () => ({
      ok: true,
      value: Object.values(useArticleStore.getState().articlesByFeedId).flat(),
    }));
  });

  it("article from a feed in folder-tech with folderId override to folder-crypto appears in folder-crypto, NOT folder-tech", async () => {
    useArticleStore.setState({
      articlesByFeedId: {
        "f-tech": [
          article("a1", "f-tech"),
          article("a2", "f-tech", { folderId: "folder-crypto" }),
        ],
      },
    });

    // Folder-crypto view should include a2 even though f-tech is in folder-tech
    await useArticleStore.getState().loadArticles(toFolderFeedId("folder-crypto"));
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual(["a2"]);

    // Folder-tech view should NOT include a2 (it's been routed away)
    await useArticleStore.getState().loadArticles(toFolderFeedId("folder-tech"));
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual(["a1"]);
  });

  it("article from a folder-less feed with folderId override appears in the target folder", async () => {
    useArticleStore.setState({
      articlesByFeedId: {
        "f-news": [
          article("a1", "f-news"),
          article("a2", "f-news", { folderId: "folder-tech" }),
        ],
      },
    });

    await useArticleStore.getState().loadArticles(toFolderFeedId("folder-tech"));
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual(["a2"]);
  });

  it("specific-feed view always shows ALL of the feed's articles regardless of folder override", async () => {
    // Routing an article elsewhere shouldn't hide it from the feed it came
    // from — the user can still find it by clicking the feed.
    useArticleStore.setState({
      articlesByFeedId: {
        "f-tech": [
          article("a1", "f-tech"),
          article("a2", "f-tech", { folderId: "folder-crypto" }),
        ],
      },
    });
    await useArticleStore.getState().loadArticles("f-tech");
    const ids = useArticleStore.getState().articles.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("article with no override still appears in its feed's folder (unchanged behaviour)", async () => {
    useArticleStore.setState({
      articlesByFeedId: {
        "f-tech": [article("a1", "f-tech")],
      },
    });
    await useArticleStore.getState().loadArticles(toFolderFeedId("folder-tech"));
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual(["a1"]);
  });
});
