import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
  needsExtraction: vi.fn().mockReturnValue(false),
}));

const mockArticle = (overrides = {}) => ({
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Test Article",
  link: "https://example.com/post",
  content: "<p>Full article content here.</p>",
  summary: "A short summary",
  author: "Author",
  publishedAt: Date.now(),
  read: true,
  createdAt: Date.now(),
  ...overrides,
});

describe("ReaderPanel", () => {
  beforeEach(() => {
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    useExtractionStore.setState({
      cache: {},
      statusMap: {},
      viewMode: "feed",
    });
  });

  it("shows empty state when no article selected", () => {
    render(<ReaderPanel />);
    expect(screen.getByText("Select an article to read.")).toBeInTheDocument();
  });

  it("renders article title and content", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Test Article",
    );
    expect(screen.getByText("Full article content here.")).toBeInTheDocument();
  });

  it("has editorial tracking-tight on article title", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("tracking-tight");
  });

  it("has gradient bottom border on article header", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const article = document.querySelector("article");
    const header = article?.querySelector("header");
    expect(header).toBeInTheDocument();
  });

  it("always shows all three buttons", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("Full text")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("shows Original button as link when article has a link", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const link = screen.getByText("Original");
    expect(link).toHaveAttribute("href", "https://example.com/post");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows extracting state when viewing extracted and extracting", async () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);

    // After initial render (which resets viewMode to "feed"), switch to extracting state
    act(() => {
      useExtractionStore.setState({
        statusMap: { "https://example.com/post": "extracting" },
        viewMode: "extracted",
      });
    });

    expect(screen.getByText(/Extracting full article/)).toBeInTheDocument();
  });

  it("renders extracted content when Extracted button clicked", async () => {
    const user = userEvent.setup();
    const shortText = "brief summary";
    const longWords = Array(150).fill("expanded").join(" ");
    useArticleStore.setState({
      selectedArticle: mockArticle({
        content: `<p>${shortText}</p>`,
        summary: `<p>${shortText}</p>`,
      }),
      articles: [],
      isLoading: false,
    });
    useExtractionStore.setState({
      cache: { "https://example.com/post": `<p>${longWords}</p>` },
      statusMap: { "https://example.com/post": "available" },
      viewMode: "feed",
    });

    const { container } = render(<ReaderPanel />);
    await user.click(screen.getByRole("radio", { name: "Full text" }));
    expect(container.textContent).toContain("expanded");
  });

  it("shows Kbd O hint next to the Original link", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const originalLink = screen.getByText("Original").closest("a");
    const kbd = originalLink?.querySelector("kbd");
    expect(kbd).toBeTruthy();
    expect(kbd?.textContent).toBe("o");
  });

  describe("timestamp display (006-S11)", () => {
    it("shows date and time with minutes, but not seconds", () => {
      const timestamp = new Date(2024, 0, 15, 14, 30, 45).getTime();
      useArticleStore.setState({
        selectedArticle: mockArticle({ publishedAt: timestamp }),
        articles: [],
        isLoading: false,
      });

      render(<ReaderPanel />);

      const metaLine = screen.getByText(/Jan.*15.*2024/);
      expect(metaLine).toBeInTheDocument();
      expect(metaLine.textContent).toMatch(/\d{1,2}:\d{2}/);
      expect(metaLine.textContent).not.toMatch(/:45/);
    });
  });

  describe("global view (ALL_FEEDS_ID)", () => {
    it("renders article when selectedFeedId is ALL_FEEDS_ID even with different feedId", () => {
      useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
      useArticleStore.setState({
        selectedArticle: mockArticle({ feedId: "some-other-feed" }),
        articles: [],
        isLoading: false,
      });

      render(<ReaderPanel />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Test Article",
      );
    });
  });
});
