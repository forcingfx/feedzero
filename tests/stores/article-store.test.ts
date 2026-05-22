import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useArticleStore,
  selectUnreadCount,
} from "../../src/stores/article-store.ts";
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

vi.mock("../../src/stores/persist-preferences.ts", () => ({
  persistPreferences: vi.fn(),
}));

import {
  getArticles,
  getAllArticles,
  updateArticle,
} from "../../src/core/storage/db.ts";
import { persistPreferences } from "../../src/stores/persist-preferences.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFolderFeedId,
} from "../../src/utils/constants.ts";

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
      articlesByFeedId: {},
      selectedArticle: null,
      isLoading: false,
      articleSortMode: "newest",
    });
    window.localStorage.removeItem("feedzero:article-sort-mode");
    vi.clearAllMocks();
  });

  describe("unread count derivation (single source of truth)", () => {
    it("selectUnreadCount derives from articlesByFeedId, not a stored counter", () => {
      useArticleStore.setState({
        articlesByFeedId: {
          "f1": [
            mockArticle("a1", false),
            mockArticle("a2", false),
            mockArticle("a3", true),
          ],
        },
      });

      expect(selectUnreadCount(useArticleStore.getState(), "f1")).toBe(2);
    });

    it("loadArticles immediately exposes a correct unread count for a freshly added feed", async () => {
      // This is the system bug: adding a feed from Explore, then selecting
      // it, triggered loadArticles but never updated unreadCounts. The
      // badge stayed at 0 until some *other* mutation recomputed counts.
      // With a derived count, loading the feed's articles is sufficient.
      const articles = [
        mockArticle("a1", false),
        mockArticle("a2", false),
        mockArticle("a3", true),
      ];
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: articles });

      await useArticleStore.getState().loadArticles("new-feed");

      expect(selectUnreadCount(useArticleStore.getState(), "new-feed")).toBe(2);
    });

    it("markAsRead decreases the derived unread count for the affected feed", async () => {
      useArticleStore.setState({
        articlesByFeedId: {
          "f1": [mockArticle("a1", false), mockArticle("a2", false)],
        },
        articles: [mockArticle("a1", false), mockArticle("a2", false)],
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().markAsRead("a1");

      expect(selectUnreadCount(useArticleStore.getState(), "f1")).toBe(1);
    });
  });

  describe("loadArticles", () => {
    it("loads articles for a feed", async () => {
      const articles = [mockArticle("a1"), mockArticle("a2")];
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: articles });

      await useArticleStore.getState().loadArticles("f1");

      expect(getArticles).toHaveBeenCalledWith("f1");
      expect(useArticleStore.getState().articles).toEqual(articles);
    });

    it("loads every cached article, not a paginated slice", async () => {
      // Pagination cap (the former 25-article displayLimit) caused the
      // visible list to disagree with the sidebar badge. loadArticles must
      // expose every article the feed has, not just the first page.
      const many = Array.from({ length: 120 }, (_, i) =>
        mockArticle(`a${i}`),
      );
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: many });

      await useArticleStore.getState().loadArticles("f1");

      expect(useArticleStore.getState().articles).toHaveLength(120);
    });

    it("clears articles on failure", async () => {
      useArticleStore.setState({ articles: [mockArticle("old")] });
      vi.mocked(getArticles).mockResolvedValue({ ok: false, error: "fail" });

      await useArticleStore.getState().loadArticles("f1");

      expect(useArticleStore.getState().articles).toEqual([]);
    });

    it("loads only articles from feeds inside the folder for a folder-aggregated feed id", async () => {
      const feed1 = { id: "f1", url: "https://a.com", title: "A", description: "", siteUrl: "https://a.com", createdAt: 0, updatedAt: 0, folderId: "tech" };
      const feed2 = { id: "f2", url: "https://b.com", title: "B", description: "", siteUrl: "https://b.com", createdAt: 0, updatedAt: 0, folderId: "tech" };
      const feed3 = { id: "f3", url: "https://c.com", title: "C", description: "", siteUrl: "https://c.com", createdAt: 0, updatedAt: 0 }; // unfiled
      useFeedStore.setState({ feeds: [feed1, feed2, feed3], folders: [] });

      const articleInFolder1 = { ...mockArticle("a1"), feedId: "f1" };
      const articleInFolder2 = { ...mockArticle("a2"), feedId: "f2" };
      const articleOutsideFolder = { ...mockArticle("a3"), feedId: "f3" };
      vi.mocked(getAllArticles).mockResolvedValue({
        ok: true,
        value: [articleInFolder1, articleInFolder2, articleOutsideFolder],
      });

      await useArticleStore.getState().loadArticles(toFolderFeedId("tech"));

      // Must hit the bulk path, not per-feed.
      expect(getAllArticles).toHaveBeenCalled();
      expect(getArticles).not.toHaveBeenCalled();

      // Only articles from feeds whose folderId === "tech" are visible.
      const visible = useArticleStore.getState().articles;
      const visibleIds = visible.map((a) => a.id).sort();
      expect(visibleIds).toEqual(["a1", "a2"]);
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

      // Article gets read: true plus a readAt timestamp (drives the
      // frequency-prefetch heuristic). Don't pin the exact ms value.
      const selected = useArticleStore.getState().selectedArticle!;
      expect(selected).toMatchObject({ ...article, read: true });
      expect(selected.readAt).toBeGreaterThan(0);
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

    it("marks every unread article in the feed, not just the first page", async () => {
      // Previously markAllAsRead operated on the paginated visible slice,
      // leaving hundreds of articles unread even though the pill said
      // "Mark N read". After dropping the cap, every unread in the feed
      // must be marked.
      const many = Array.from({ length: 100 }, (_, i) =>
        mockArticle(`a${i}`, false),
      );
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: many });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().loadArticles("f1");
      await useArticleStore.getState().markAllAsRead();

      expect(updateArticle).toHaveBeenCalledTimes(100);
      const state = useArticleStore.getState().articles;
      expect(state.every((a) => a.read)).toBe(true);
      expect(state).toHaveLength(100);
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

  describe("folder-aggregated view", () => {
    it("selectArticle allows any feedId when selectedFeedId is a folder feed", async () => {
      useFeedStore.setState({ selectedFeedId: toFolderFeedId("tech") });
      const articleFromFolderMember = {
        ...mockArticle("a1"),
        feedId: "feed-in-folder",
      };
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(articleFromFolderMember);

      expect(useArticleStore.getState().selectedArticle?.feedId).toBe(
        "feed-in-folder",
      );
    });
  });

  describe("article sort mode", () => {
    // Reader-polish quick win: power users want to flip between newest,
    // oldest, and unread-first without leaving the article pane. Sort is a
    // user preference, persisted to localStorage so it survives reload.
    const at = (id: string, publishedAt: number, read = false) => ({
      id,
      feedId: "f1",
      guid: id,
      title: id,
      link: `https://example.com/${id}`,
      content: "",
      summary: "",
      author: "",
      publishedAt,
      read,
      createdAt: 0,
    });

    it("defaults to 'newest' so the historical sort behaviour is preserved", () => {
      expect(useArticleStore.getState().articleSortMode).toBe("newest");
    });

    it("setArticleSortMode('oldest') reverses the chronological order in the visible list", async () => {
      const articles = [at("old", 100), at("mid", 200), at("new", 300)];
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: articles });
      await useArticleStore.getState().loadArticles("f1");

      useArticleStore.getState().setArticleSortMode("oldest");

      expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual([
        "old",
        "mid",
        "new",
      ]);
    });

    it("setArticleSortMode('unread-first') groups unread before read; within each group, newest first", async () => {
      const articles = [
        at("read-newest", 400, true),
        at("unread-old", 100, false),
        at("read-old", 200, true),
        at("unread-newest", 300, false),
      ];
      vi.mocked(getArticles).mockResolvedValue({ ok: true, value: articles });
      await useArticleStore.getState().loadArticles("f1");

      useArticleStore.getState().setArticleSortMode("unread-first");

      expect(useArticleStore.getState().articles.map((a) => a.id)).toEqual([
        "unread-newest",
        "unread-old",
        "read-newest",
        "read-old",
      ]);
    });

    it("persists the chosen mode through the preferences store", () => {
      useArticleStore.getState().setArticleSortMode("oldest");
      expect(persistPreferences).toHaveBeenCalledWith({ articleSortMode: "oldest" });
    });

    it("rejects unknown modes (no-op, keeps previous mode)", () => {
      useArticleStore.getState().setArticleSortMode("newest");
      // @ts-expect-error — intentionally bad input
      useArticleStore.getState().setArticleSortMode("random-nonsense");
      expect(useArticleStore.getState().articleSortMode).toBe("newest");
    });
  });

  describe("toggleStar", () => {
    it("flips an article from unstarred to starred and stamps starredAt", async () => {
      const article = mockArticle("a1");
      useArticleStore.setState({
        articlesByFeedId: { f1: [article] },
        articles: [article],
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      const before = Date.now();
      await useArticleStore.getState().toggleStar("a1");
      const after = Date.now();

      const updated = useArticleStore.getState().articles[0];
      expect(updated.starred).toBe(true);
      expect(updated.starredAt).toBeGreaterThanOrEqual(before);
      expect(updated.starredAt).toBeLessThanOrEqual(after);
      expect(updateArticle).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1", starred: true }),
      );
    });

    it("flips an already-starred article back to unstarred and clears starredAt", async () => {
      const article = { ...mockArticle("a1"), starred: true, starredAt: 12345 };
      useArticleStore.setState({
        articlesByFeedId: { f1: [article] },
        articles: [article],
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().toggleStar("a1");

      const updated = useArticleStore.getState().articles[0];
      expect(updated.starred).toBe(false);
      expect(updated.starredAt).toBeUndefined();
    });

    it("schedules a sync push so the star state propagates to other devices", async () => {
      const scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");
      const article = mockArticle("a1");
      useArticleStore.setState({
        articlesByFeedId: { f1: [article] },
        articles: [article],
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().toggleStar("a1");

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("no-ops silently when the article id is unknown", async () => {
      useArticleStore.setState({ articlesByFeedId: {}, articles: [] });

      await useArticleStore.getState().toggleStar("missing");

      expect(updateArticle).not.toHaveBeenCalled();
    });

    it("updates selectedArticle so the reader's star icon reflects the new state immediately", async () => {
      // The reader subscribes to `selectedArticle`, not `articlesByFeedId`.
      // Before the fix, toggleStar mutated the bucket lists but left
      // `selectedArticle` pointing at the stale (pre-toggle) snapshot —
      // the persisted star flipped, but the icon stayed grey until the
      // user navigated away and back.
      const article = mockArticle("a1");
      useArticleStore.setState({
        articlesByFeedId: { f1: [article] },
        articles: [article],
        selectedArticle: article,
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().toggleStar("a1");

      const sel = useArticleStore.getState().selectedArticle;
      expect(sel?.id).toBe("a1");
      expect(sel?.starred).toBe(true);
    });

    it("leaves selectedArticle alone when a different article is toggled", async () => {
      // Only the article currently in the reader should re-key. Toggling
      // a sibling row should not swap the reader's selection.
      const a1 = mockArticle("a1");
      const a2 = mockArticle("a2");
      useArticleStore.setState({
        articlesByFeedId: { f1: [a1, a2] },
        articles: [a1, a2],
        selectedArticle: a1,
      });
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().toggleStar("a2");

      const sel = useArticleStore.getState().selectedArticle;
      expect(sel?.id).toBe("a1");
      expect(Boolean(sel?.starred)).toBe(false);
    });
  });

  describe("starred virtual feed (STARRED_FEED_ID)", () => {
    it("loadArticles(STARRED_FEED_ID) returns only starred articles across every feed", async () => {
      const a1 = { ...mockArticle("a1"), feedId: "feed-1", starred: true, starredAt: 100 };
      const a2 = { ...mockArticle("a2"), feedId: "feed-2", starred: false };
      const a3 = { ...mockArticle("a3"), feedId: "feed-2", starred: true, starredAt: 200 };
      vi.mocked(getAllArticles).mockResolvedValue({
        ok: true,
        value: [a1, a2, a3],
      });

      await useArticleStore.getState().loadArticles(STARRED_FEED_ID);

      const visible = useArticleStore.getState().articles;
      const ids = visible.map((a) => a.id).sort();
      expect(ids).toEqual(["a1", "a3"]);
    });

    it("starred view orders by starredAt descending (most-recently-starred first)", async () => {
      const oldStar = {
        ...mockArticle("old-star"),
        starred: true,
        starredAt: 100,
        publishedAt: 999,
      };
      const newStar = {
        ...mockArticle("new-star"),
        starred: true,
        starredAt: 500,
        publishedAt: 200,
      };
      vi.mocked(getAllArticles).mockResolvedValue({
        ok: true,
        value: [oldStar, newStar],
      });

      await useArticleStore.getState().loadArticles(STARRED_FEED_ID);

      const visible = useArticleStore.getState().articles;
      expect(visible.map((a) => a.id)).toEqual(["new-star", "old-star"]);
    });

    it("selectArticle allows any feedId when selectedFeedId is STARRED_FEED_ID", async () => {
      useFeedStore.setState({ selectedFeedId: STARRED_FEED_ID });
      const articleFromAnyFeed = {
        ...mockArticle("a1"),
        feedId: "some-other-feed",
        starred: true,
      };
      vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });

      await useArticleStore.getState().selectArticle(articleFromAnyFeed);

      expect(useArticleStore.getState().selectedArticle?.feedId).toBe(
        "some-other-feed",
      );
    });
  });
});
