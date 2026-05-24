import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "@feedzero/core/utils/constants";
import {
  installVirtualizerShims,
  restoreVirtualizerShims,
} from "../../helpers/virtualizer-shims.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

const mockArticle = (
  id: string,
  title: string,
  read = false,
  feedId = "f1",
) => ({
  id,
  feedId,
  guid: id,
  title,
  link: `https://example.com/${id}`,
  content: "<p>content</p>",
  summary: "summary",
  author: "Author",
  publishedAt: Date.now(),
  read,
  createdAt: Date.now(),
});

const mockFeed = (id: string, title: string) => ({
  id,
  url: `https://${id}.com/feed`,
  title,
  description: "",
  siteUrl: `https://${id}.com`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe("ArticleList", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    // Disable flood-grouping for the historical assertions — many of them
    // build long lists of articles with identical publishedAt + feedId, which
    // would otherwise collapse into a single stacked group. The dedicated
    // "article grouping" describe below explicitly opts in.
    useAppStore.setState({ groupArticleFloods: false });
  });

  afterEach(() => {
    restoreVirtualizerShims();
  });

  it("shows empty state when no feed selected", () => {
    render(<ArticleList />);
    expect(
      screen.getByText("Select a feed to view articles."),
    ).toBeInTheDocument();
  });

  it("offers a prominent refresh path when the selected feed has no articles", () => {
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Feed 1")],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });

    render(<ArticleList />);

    expect(screen.getByTestId("empty-refresh")).toBeInTheDocument();
  });

  it("does not show the refresh path while the feed is still loading", () => {
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Feed 1")],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: true,
    });

    render(<ArticleList />);

    expect(screen.queryByTestId("empty-refresh")).toBeNull();
  });

  it("tapping the empty-state refresh refreshes the current feed", async () => {
    const { refreshFeed } = await import("@/core/feeds/feed-service.ts");
    const { getFeed } = await import("@/core/storage/db.ts");
    const f1 = mockFeed("f1", "Feed 1");
    vi.mocked(getFeed).mockResolvedValue({ ok: true, value: f1 });
    vi.mocked(refreshFeed).mockResolvedValue({
      ok: true,
      value: { newCount: 0, updatedCount: 0 },
    });
    useFeedStore.setState({
      feeds: [f1],
      selectedFeedId: "f1",
      isRefreshingAll: false,
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<ArticleList />);
    await user.click(screen.getByTestId("empty-refresh"));

    expect(refreshFeed).toHaveBeenCalledWith(f1);
  });

  it("never renders a Load more button — the display cap has been removed", () => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    // Even with many articles the list renders them all — no pagination.
    const articles = Array.from({ length: 120 }, (_, i) =>
      mockArticle(`a${i}`, `Article ${i}`),
    );
    useArticleStore.setState({
      articles,
      selectedArticle: null,
      isLoading: false,
    });

    render(<ArticleList />);

    expect(
      screen.queryByRole("button", { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it("renders articles when feed is selected", () => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [
        mockArticle("a1", "First Post"),
        mockArticle("a2", "Second Post"),
      ],
      selectedArticle: null,
      isLoading: false,
    });

    render(<ArticleList />);
    expect(screen.getByText("First Post")).toBeInTheDocument();
    expect(screen.getByText("Second Post")).toBeInTheDocument();
  });

  it("calls onArticleSelect when article clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    const article = mockArticle("a1", "Click Me");
    useArticleStore.setState({
      articles: [article],
      selectedArticle: null,
      isLoading: false,
    });

    render(<ArticleList onArticleSelect={onSelect} />);
    await user.click(screen.getByText("Click Me"));

    expect(onSelect).toHaveBeenCalled();
  });

  it("clicking an article does not snap-scroll the list (the user-initiated click implies the item is already visible)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    // Build a long list so the virtualizer has work to do.
    const articles = Array.from({ length: 200 }, (_, i) =>
      mockArticle(`a${i}`, `Article ${i}`),
    );
    useArticleStore.setState({
      articles,
      selectedArticle: null,
      isLoading: false,
    });

    const { container } = render(<ArticleList />);
    const scrollEl = container.querySelector(".overflow-y-auto") as HTMLElement;

    // Move scroll to a known mid-list position.
    Object.defineProperty(scrollEl, "scrollTop", {
      configurable: true,
      writable: true,
      value: 1500,
    });
    const scrollToSpy = vi.fn();
    scrollEl.scrollTo = scrollToSpy as unknown as typeof scrollEl.scrollTo;

    // Click any visible article — the list should not call scrollTo on the
    // container as a result. (Before the fix, the selection-change effect
    // unconditionally re-anchored the virtualizer to the new selection.)
    await user.click(screen.getAllByRole("option")[0]);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("reserves bottom space inside the scroll container so the sticky 'Mark N read' pill does not overlap the last article", () => {
    // The pill is `sticky bottom-3` with height `h-7`. Without bottom padding
    // on the list, the last article sits flush against the pill at the end
    // of the scroll container — that's GitLab #11. Reserving padding equal
    // to or greater than the pill's height + offset keeps them apart.
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [
        mockArticle("a1", "First", false),
        mockArticle("a2", "Second", false),
      ],
      selectedArticle: null,
      isLoading: false,
    });

    const { container } = render(<ArticleList />);
    const list = container.querySelector('ul[role="listbox"]');
    expect(list).not.toBeNull();
    // pb-12 = 48px ≥ pill height (h-7 = 28px) + bottom offset (bottom-3 = 12px).
    expect(list!.className).toContain("pb-12");
  });

  it("changing selection to a visible article does not scroll the list (regardless of which call site triggers the change)", async () => {
    // The auto-scroll-into-view effect must only fire when the new selection
    // is *not* already visible. Click handlers, keyboard navigation, URL
    // restoration, and external store mutations all flow through the same
    // selectedArticle → effect path. The previous flag-based opt-out only
    // covered ArticleList's own click handler; selection changes from
    // anywhere else (URL navigation, external store updates) would re-fire
    // the effect with the flag already false, scrolling away from the user's
    // current viewport.
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    const articles = Array.from({ length: 200 }, (_, i) =>
      mockArticle(`a${i}`, `Article ${i}`),
    );
    // Pre-select the first article — already read.
    useArticleStore.setState({
      articles: articles.map((a) =>
        a.id === "a0" ? { ...a, read: true } : a,
      ),
      selectedArticle: { ...articles[0], read: true },
      isLoading: false,
    });

    const { container } = render(<ArticleList />);
    const scrollEl = container.querySelector(".overflow-y-auto") as HTMLElement;
    const scrollToSpy = vi.fn();
    scrollEl.scrollTo = scrollToSpy as unknown as typeof scrollEl.scrollTo;
    scrollEl.scrollBy = vi.fn() as unknown as typeof scrollEl.scrollBy;

    // Switch the selection externally — bypasses handleSelect entirely.
    // a1 is in the rendered window and visible, so no scroll should occur.
    const target = useArticleStore.getState().articles[1];
    expect(target.id).toBe("a1");
    await act(async () => {
      useArticleStore.setState({ selectedArticle: target });
    });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("clicking a visible article does not re-anchor the virtualizer to the previously-selected (off-screen) article (GitLab #12)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    // Long list so the virtualizer renders only a window of items.
    const articles = Array.from({ length: 200 }, (_, i) =>
      mockArticle(`a${i}`, `Article ${i}`),
    );
    // Pre-select the first article. The user has scrolled it off-screen.
    useArticleStore.setState({
      articles,
      selectedArticle: articles[0],
      isLoading: false,
    });

    const { container } = render(<ArticleList />);
    const scrollEl = container.querySelector(".overflow-y-auto") as HTMLElement;
    const virtualizerScrollSpy = vi.fn();
    scrollEl.scrollTo = virtualizerScrollSpy as unknown as typeof scrollEl.scrollTo;
    // Stub scrollBy as well — some virtualizer code paths use it.
    scrollEl.scrollBy = vi.fn() as unknown as typeof scrollEl.scrollBy;

    // Now mutate the articles array — this simulates anything that changes
    // the array reference *without* changing the selection: the auto-mark-
    // as-read timer firing, a refresh updating an article, sync push, etc.
    // The selection is unchanged; the user has not re-selected anything.
    // The list MUST NOT scroll just because the array reference changed.
    const updatedArticles = articles.map((a) =>
      a.id === "a0" ? { ...a, read: true } : a,
    );
    useArticleStore.setState({ articles: updatedArticles });

    // Allow React to flush the effect triggered by the articles change.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now click a still-visible article. The selection changes from a0 to
    // whatever is rendered first. handleSelect sets the skip flag, so no
    // scroll should happen for THIS selection change either.
    const visibleOptions = screen.getAllByRole("option");
    await user.click(visibleOptions[0]);

    // Across the whole interaction (articles mutation + click), the list
    // must never have re-anchored the scroll position. The bug was: a stray
    // articles-reference-change effect call, plus the click effect, both
    // calling scrollToIndex(previouslySelected) and bringing it back into
    // view.
    expect(virtualizerScrollSpy).not.toHaveBeenCalled();
  });

  it("shows read/unread styling", () => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [
        mockArticle("a1", "Unread", false),
        mockArticle("a2", "Read", true),
      ],
      selectedArticle: null,
      isLoading: false,
    });

    const { container } = render(<ArticleList />);
    // Unread items have a visible dot, read items have a transparent dot
    const dots = container.querySelectorAll(".rounded-full.size-1\\.5");
    const unreadDot = dots[0];
    const readDot = dots[1];
    expect(unreadDot.className).toContain("bg-blue-400");
    expect(readDot.className).toContain("bg-transparent");
  });

  describe("global view (ALL_FEEDS_ID)", () => {
    it("shows feed title for each article when in global view", () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Tech News"), mockFeed("f2", "Gaming Daily")],
        selectedFeedId: ALL_FEEDS_ID,
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: [
          mockArticle("a1", "Tech Article", false, "f1"),
          mockArticle("a2", "Another Article", false, "f2"),
        ],
        selectedArticle: null,
        isLoading: false,
      });

      render(<ArticleList />);

      expect(screen.getByText(/Tech News/)).toBeInTheDocument();
      expect(screen.getByText(/Gaming Daily/)).toBeInTheDocument();
    });

    it("does not show feed title on each article when not in global view", () => {
      // The article-list title bar shows the current feed name once at
      // the top (introduced when the cog + sort pills moved into a
      // proper title bar). Per-article feed labels still only appear
      // in aggregated views — this test now scopes to the per-article
      // labels via the title bar's exclusion.
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Tech News")],
        selectedFeedId: "f1",
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: [mockArticle("a1", "Tech Article", false, "f1")],
        selectedArticle: null,
        isLoading: false,
      });

      const { container } = render(<ArticleList />);

      // Title bar should contain "Tech News" once; the article rows
      // beneath it should not repeat the feed name.
      const titleBar = container.querySelector(
        "[data-testid='article-list-controls']",
      );
      expect(titleBar?.textContent).toContain("Tech News");

      const articleRows = container.querySelectorAll(
        "[data-testid='article-item']",
      );
      for (const row of Array.from(articleRows)) {
        expect(row.textContent).not.toContain("Tech News");
      }
    });

    it("shows feed favicon for each article when in global view", () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Tech News"), mockFeed("f2", "Gaming Daily")],
        selectedFeedId: ALL_FEEDS_ID,
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: [
          mockArticle("a1", "Tech Article", false, "f1"),
          mockArticle("a2", "Another Article", false, "f2"),
        ],
        selectedArticle: null,
        isLoading: false,
      });

      const { container } = render(<ArticleList />);

      const favicons = container.querySelectorAll("img");
      expect(favicons).toHaveLength(2);
      expect(favicons[0].getAttribute("src")).toBe(
        "/api/icon?domain=f1.com",
      );
      expect(favicons[1].getAttribute("src")).toBe(
        "/api/icon?domain=f2.com",
      );
    });

    it("does not show feed favicon per article when not in global view", () => {
      // The title bar shows the current feed's favicon once at the top.
      // The per-article favicon is only for aggregated views — this
      // test scopes to the article rows specifically.
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Tech News")],
        selectedFeedId: "f1",
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: [mockArticle("a1", "Tech Article", false, "f1")],
        selectedArticle: null,
        isLoading: false,
      });

      const { container } = render(<ArticleList />);

      // Title bar may include the favicon; article rows must not.
      const articleRows = container.querySelectorAll(
        "[data-testid='article-item']",
      );
      for (const row of Array.from(articleRows)) {
        expect(row.querySelector("img")).toBeNull();
      }
    });
  });

  describe("virtualization (large lists)", () => {
    it("does not render every article to the DOM for long lists", () => {
      useFeedStore.setState({
        feeds: [],
        selectedFeedId: "f1",
        isLoading: false,
        error: null,
      });
      const articles = Array.from({ length: 500 }, (_, i) =>
        mockArticle(`a${i}`, `Article ${i}`),
      );
      useArticleStore.setState({
        articles,
        selectedArticle: null,
        isLoading: false,
      });

      const { container } = render(<ArticleList />);

      const rendered = container.querySelectorAll('li[role="option"]');
      // Exact count depends on estimated item size, but must be bounded by the
      // viewport — nowhere near the full 500. A generous cap still catches the
      // regression of rendering all items.
      expect(rendered.length).toBeLessThan(100);
      expect(rendered.length).toBeGreaterThan(0);
    });
  });

  describe("folder-aggregated view", () => {
    it("shows feed title and favicon for each article when in a folder view", () => {
      // Folder-aggregated view is a second kind of aggregated view alongside
      // ALL_FEEDS_ID. It must show the same per-article provenance (feed
      // title + favicon) so users can tell which feed each article belongs to.
      useFeedStore.setState({
        feeds: [
          { ...mockFeed("f1", "Tech News"), folderId: "tech" },
          { ...mockFeed("f2", "Gaming Daily"), folderId: "tech" },
        ],
        selectedFeedId: toFolderFeedId("tech"),
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: [
          mockArticle("a1", "Tech Article", false, "f1"),
          mockArticle("a2", "Gaming Article", false, "f2"),
        ],
        selectedArticle: null,
        isLoading: false,
      });

      const { container } = render(<ArticleList />);

      expect(screen.getByText(/Tech News/)).toBeInTheDocument();
      expect(screen.getByText(/Gaming Daily/)).toBeInTheDocument();

      const favicons = container.querySelectorAll("img");
      expect(favicons).toHaveLength(2);
      expect(favicons[0].getAttribute("src")).toBe(
        "/api/icon?domain=f1.com",
      );
      expect(favicons[1].getAttribute("src")).toBe(
        "/api/icon?domain=f2.com",
      );
    });
  });

  describe("article grouping (flood collapse)", () => {
    const now = 10_000_000;
    const minute = 60_000;
    /** 6 same-feed articles, each 1 minute apart. Meets MIN_GROUP_SIZE=5. */
    const floodArticles = [
      { ...mockArticle("a1", "Latest", false, "f1"), publishedAt: now },
      { ...mockArticle("a2", "Second", false, "f1"), publishedAt: now - 1 * minute },
      { ...mockArticle("a3", "Third", false, "f1"), publishedAt: now - 2 * minute },
      { ...mockArticle("a4", "Fourth", false, "f1"), publishedAt: now - 3 * minute },
      { ...mockArticle("a5", "Fifth", false, "f1"), publishedAt: now - 4 * minute },
      { ...mockArticle("a6", "Sixth", false, "f1"), publishedAt: now - 5 * minute },
    ];

    it("does NOT group in a single-feed view, even with a 6-article flood", () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Feed One")],
        selectedFeedId: "f1",
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: floodArticles,
        selectedArticle: null,
        isLoading: false,
      });
      useAppStore.setState({ groupArticleFloods: true });

      render(<ArticleList />);

      // Per-feed view: grouping is intentionally disabled — the user
      // has already chosen to focus on this feed.
      expect(screen.getAllByRole("option")).toHaveLength(6);
      expect(
        screen.queryByRole("button", { name: /Show .* more/ }),
      ).not.toBeInTheDocument();
    });

    it("collapses a 6-article flood in /feeds/all (aggregated view) into one row + summary", () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Aggregator")],
        selectedFeedId: ALL_FEEDS_ID,
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: floodArticles,
        selectedArticle: null,
        isLoading: false,
      });
      useAppStore.setState({ groupArticleFloods: true });

      render(<ArticleList />);

      // Aggregated view: only the top article is a role=option; the
      // remaining 5 are hidden behind the summary row.
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(screen.getByText("Latest")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Show 5 more.*Aggregator/ }),
      ).toBeInTheDocument();
    });

    it("does NOT group when the flood is below MIN_GROUP_SIZE (4 articles)", () => {
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Aggregator")],
        selectedFeedId: ALL_FEEDS_ID,
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: floodArticles.slice(0, 4),
        selectedArticle: null,
        isLoading: false,
      });
      useAppStore.setState({ groupArticleFloods: true });

      render(<ArticleList />);
      expect(screen.getAllByRole("option")).toHaveLength(4);
      expect(
        screen.queryByRole("button", { name: /Show .* more/ }),
      ).not.toBeInTheDocument();
    });

    it("clicking the summary row expands the group inline", async () => {
      const user = userEvent.setup();
      useFeedStore.setState({
        feeds: [mockFeed("f1", "Aggregator")],
        selectedFeedId: ALL_FEEDS_ID,
        isLoading: false,
        error: null,
      });
      useArticleStore.setState({
        articles: floodArticles,
        selectedArticle: null,
        isLoading: false,
      });
      useAppStore.setState({ groupArticleFloods: true });

      render(<ArticleList />);
      await user.click(
        screen.getByRole("button", { name: /Show 5 more/ }),
      );

      // All 6 articles now appear as separate role=option rows.
      expect(screen.getAllByRole("option")).toHaveLength(6);
      expect(screen.getByText("Latest")).toBeInTheDocument();
      expect(screen.getByText("Sixth")).toBeInTheDocument();
      // The summary row now acts as the collapser.
      expect(
        screen.getByRole("button", { name: /Collapse/ }),
      ).toBeInTheDocument();
    });
  });
});
