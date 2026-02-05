import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";

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

    render(<ArticleList />);
    // Unread items use text-foreground, read items use text-muted-foreground with opacity
    expect(screen.getByText("Unread").className).toContain("text-foreground");
    expect(screen.getByText("Read").className).toContain(
      "text-muted-foreground",
    );
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
      expect(favicons[0]).toHaveAttribute("src", "https://f1.com/favicon.ico");
      expect(favicons[1]).toHaveAttribute("src", "https://f2.com/favicon.ico");
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
});
