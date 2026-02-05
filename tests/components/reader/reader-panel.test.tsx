import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
      viewMode: "feed",
      isExtracting: false,
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

  it("shows author and original link", () => {
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

  it("shows extracting state", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    useExtractionStore.setState({
      cache: {},
      viewMode: "extracted",
      isExtracting: true,
    });

    render(<ReaderPanel />);
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
    // Pre-populate cache so click immediately shows content
    useExtractionStore.setState({
      cache: { "https://example.com/post": `<p>${longWords}</p>` },
      viewMode: "feed",
      isExtracting: false,
    });

    const { container } = render(<ReaderPanel />);
    // Click "Extracted" button to switch mode
    await user.click(screen.getByRole("radio", { name: "Extracted" }));
    expect(container.textContent).toContain("expanded");
  });

  it("shows view toggle when extraction mode available", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle({
        content: "<p>short</p>",
        summary: "<p>short</p>",
      }),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    expect(screen.getByRole("radio", { name: "Feed" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Extracted" }),
    ).toBeInTheDocument();
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
    expect(kbd?.textContent).toBe("O");
  });

  describe("timestamp display (006-S11)", () => {
    it("shows date and time with minutes, but not seconds", () => {
      // Create article with a specific timestamp: Jan 15, 2024 at 14:30:45
      const timestamp = new Date(2024, 0, 15, 14, 30, 45).getTime();
      useArticleStore.setState({
        selectedArticle: mockArticle({ publishedAt: timestamp }),
        articles: [],
        isLoading: false,
      });

      render(<ReaderPanel />);

      // The formatted date should include hour and minute
      const metaLine = screen.getByText(/Jan.*15.*2024/);
      expect(metaLine).toBeInTheDocument();

      // Should show time (hour:minute)
      expect(metaLine.textContent).toMatch(/\d{1,2}:\d{2}/);

      // Should NOT show seconds (:45)
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
