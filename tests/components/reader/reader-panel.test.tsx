import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "@/utils/constants.ts";

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

  it("shows feed name below article title", () => {
    useFeedStore.setState({
      feeds: [{ id: "f1", url: "https://example.com/feed", title: "Example News", description: "", siteUrl: "https://example.com", createdAt: 0, updatedAt: 0 }],
      selectedFeedId: "f1",
    });
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    expect(screen.getByText("Example News")).toBeInTheDocument();
  });

  it("article header has no bottom border separator", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const header = document.querySelector("article header");
    expect(header?.className).not.toContain("border-b");
  });

  it("shows Feed and Full text buttons (no Original button)", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("Full text")).toBeInTheDocument();
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
  });

  it("article title is a link to the original URL", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const titleLink = screen.getByRole("link", { name: /Test Article/ });
    expect(titleLink).toHaveAttribute("href", "https://example.com/post");
    expect(titleLink).toHaveAttribute("target", "_blank");
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

  it("shows a discreet external link icon near the title with o kbd hint", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const hint = screen.getByTestId("open-original-hint");
    expect(hint).toBeInTheDocument();
    expect(hint.querySelector("kbd")?.textContent).toBe("o");
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

  describe("folder-aggregated view", () => {
    it("renders article from any feed when selectedFeedId is a folder feed", () => {
      // Folder feed is an aggregated view: the selected article may come
      // from any feed in the folder. The defensive mismatch check must not
      // reject it the way it rejects wrong-feed articles in single-feed views.
      useFeedStore.setState({ selectedFeedId: toFolderFeedId("tech") });
      useArticleStore.setState({
        selectedArticle: mockArticle({ feedId: "some-feed-in-folder" }),
        articles: [],
        isLoading: false,
      });

      render(<ReaderPanel />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Test Article",
      );
    });
  });

  describe("desktop navigation pills", () => {
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    const prevArt = { ...mockArticle(), id: "a0", title: "Prev Article" };

    beforeEach(() => {
      useArticleStore.setState({
        selectedArticle: mockArticle(),
        articles: [],
        isLoading: false,
      });
    });

    it("shows next pill when nextArticle prop provided", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("next-pill")).toBeInTheDocument();
    });

    it("shows prev pill when prevArticle prop provided", () => {
      render(<ReaderPanel prevArticle={prevArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("prev-pill")).toBeInTheDocument();
    });

    it("shows both pills when both provided", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("next-pill")).toBeInTheDocument();
      expect(screen.getByTestId("prev-pill")).toBeInTheDocument();
    });

    it("does not show pills when neither provided", () => {
      render(<ReaderPanel />);
      expect(screen.queryByTestId("next-pill")).toBeNull();
      expect(screen.queryByTestId("prev-pill")).toBeNull();
    });

    it("next pill shows j kbd hint", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      const pill = screen.getByTestId("next-pill");
      expect(pill.querySelector("kbd")).toBeTruthy();
      expect(pill.querySelector("kbd")!.textContent).toBe("j");
    });

    it("prev pill shows k kbd hint", () => {
      render(<ReaderPanel prevArticle={prevArt} onNavigate={vi.fn()} />);
      const pill = screen.getByTestId("prev-pill");
      expect(pill.querySelector("kbd")).toBeTruthy();
      expect(pill.querySelector("kbd")!.textContent).toBe("k");
    });

    it("clicking next pill calls onNavigate with nextArticle", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<ReaderPanel nextArticle={nextArt} onNavigate={onNavigate} />);
      await user.click(screen.getByTestId("next-pill"));
      expect(onNavigate).toHaveBeenCalledWith(nextArt);
    });

    it("clicking prev pill calls onNavigate with prevArticle", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<ReaderPanel prevArticle={prevArt} onNavigate={onNavigate} />);
      await user.click(screen.getByTestId("prev-pill"));
      expect(onNavigate).toHaveBeenCalledWith(prevArt);
    });

    it("pills do not render when onNavigate is not provided", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} />);
      expect(screen.queryByTestId("next-pill")).toBeNull();
      expect(screen.queryByTestId("prev-pill")).toBeNull();
    });
  });
});
