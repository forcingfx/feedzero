import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "@/utils/constants.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
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
  });

  it("shows empty state when no feed selected", () => {
    render(<ArticleList />);
    expect(
      screen.getByText("Select a feed to view articles."),
    ).toBeInTheDocument();
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

    it("does not show feed title when not in global view", () => {
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

      render(<ArticleList />);

      expect(screen.queryByText(/Tech News/)).not.toBeInTheDocument();
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
        "/api/favicon?domain=f1.com",
      );
      expect(favicons[1].getAttribute("src")).toBe(
        "/api/favicon?domain=f2.com",
      );
    });

    it("does not show feed favicon when not in global view", () => {
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

      expect(container.querySelector("img")).not.toBeInTheDocument();
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
        "/api/favicon?domain=f1.com",
      );
      expect(favicons[1].getAttribute("src")).toBe(
        "/api/favicon?domain=f2.com",
      );
    });
  });
});
