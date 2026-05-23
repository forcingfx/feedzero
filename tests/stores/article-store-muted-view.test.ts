/**
 * Muted articles are hidden from default views by default. The article
 * still rides through the vault and exists in storage — only the
 * default *display* hides it. Users can flip a `showMuted` toggle to
 * make muted articles reappear (e.g., a "Show muted (N)" affordance).
 *
 * Coverage matrix:
 *   default view       | showMuted=false | showMuted=true
 *   ──────────────────────────────────────────────────────
 *   ALL feeds          | hide muted      | show muted
 *   specific feed      | hide muted      | show muted
 *   folder feed        | hide muted      | show muted
 *   starred view       | always show     | always show   (user-explicit signal)
 *   smart filter view  | always show     | always show   (user-explicit predicate)
 *
 * Mute is hidden, not deleted. selectUnreadCount must keep treating
 * muted articles as part of the feed's unread tally — the badge stays
 * honest about what's behind the curtain.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useArticleStore,
  selectUnreadCount,
  selectMutedCount,
} from "../../src/stores/article-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFolderFeedId,
} from "@feedzero/core/utils/constants";

vi.mock("../../src/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  getAllArticles: vi.fn(),
  updateArticle: vi.fn(),
}));

import {
  getArticles,
  getAllArticles,
} from "../../src/core/storage/db.ts";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import type { Article, Feed } from "@feedzero/core/types";

function article(id: string, feedId: string, extras: Partial<Article> = {}): Article {
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

/**
 * Seed the article-store's source of truth + the db mocks together
 * so loadArticles' background fetch doesn't wipe our test data.
 */
function seedFeed(feedId: string, articles: Article[]) {
  useArticleStore.setState({
    articlesByFeedId: {
      ...useArticleStore.getState().articlesByFeedId,
      [feedId]: articles,
    },
  });
}

describe("muted articles are hidden from default views", () => {
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
      feeds: [feed("f1"), feed("f2", "folder-x")],
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

  it("hides muted articles from a specific feed's view by default", async () => {
    seedFeed("f1", [
      article("a1", "f1"),
      article("a2", "f1", { muted: true }),
      article("a3", "f1"),
    ]);
    await useArticleStore.getState().loadArticles("f1");
    const visibleIds = useArticleStore.getState().articles.map((a) => a.id);
    expect(visibleIds).toEqual(["a1", "a3"]);
  });

  it("hides muted articles from ALL_FEEDS view by default", async () => {
    seedFeed("f1", [article("a1", "f1"), article("a2", "f1", { muted: true })]);
    seedFeed("f2", [article("a3", "f2", { muted: true }), article("a4", "f2")]);
    await useArticleStore.getState().loadArticles(ALL_FEEDS_ID);
    const ids = useArticleStore.getState().articles.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "a4"]);
  });

  it("hides muted articles from folder view by default", async () => {
    seedFeed("f2", [
      article("a1", "f2"),
      article("a2", "f2", { muted: true }),
    ]);
    await useArticleStore.getState().loadArticles(toFolderFeedId("folder-x"));
    const ids = useArticleStore.getState().articles.map((a) => a.id);
    expect(ids).toEqual(["a1"]);
  });

  it("shows muted articles in starred view (user-explicit signal)", async () => {
    seedFeed("f1", [
      article("a1", "f1", { starred: true, starredAt: 100 }),
      article("a2", "f1", { starred: true, starredAt: 200, muted: true }),
    ]);
    await useArticleStore.getState().loadArticles(STARRED_FEED_ID);
    const ids = useArticleStore.getState().articles.map((a) => a.id);
    expect(ids).toContain("a2");
  });

  it("setShowMuted(true) makes muted articles reappear in default views", async () => {
    seedFeed("f1", [
      article("a1", "f1"),
      article("a2", "f1", { muted: true }),
    ]);
    await useArticleStore.getState().loadArticles("f1");
    useFeedStore.setState({ selectedFeedId: "f1" });
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual(["a1"]);

    useArticleStore.getState().setShowMuted(true);
    expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("selectMutedCount reports how many muted articles a feed has", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [
          article("a1", "f1"),
          article("a2", "f1", { muted: true }),
          article("a3", "f1", { muted: true }),
        ],
      },
    });
    expect(selectMutedCount(useArticleStore.getState(), "f1")).toBe(2);
  });

  it("muted articles still count toward the unread badge", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [
          article("a1", "f1"),
          article("a2", "f1", { muted: true }),
          article("a3", "f1", { read: true }),
        ],
      },
    });
    // Two unread (a1, a2). The fact that a2 is muted doesn't make
    // it "read" — the badge stays honest about what's behind the curtain.
    expect(selectUnreadCount(useArticleStore.getState(), "f1")).toBe(2);
  });
});
