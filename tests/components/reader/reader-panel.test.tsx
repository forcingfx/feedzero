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

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => mockIsDesktop,
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
    await user.click(screen.getByRole("button", { name: /Full text/ }));
    expect(container.textContent).toContain("expanded");
  });

  it("open-original-hint is a link to the article URL", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const hint = screen.getByTestId("open-original-hint");
    expect(hint.tagName).toBe("A");
    expect(hint).toHaveAttribute("href", "https://example.com/post");
    expect(hint).toHaveAttribute("target", "_blank");
  });

  it("open-original-hint does not show kbd inline — hint is in tooltip on hover", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    const hint = screen.getByTestId("open-original-hint");
    // kbd should not be a permanent child — it lives in the tooltip content only
    expect(hint.querySelector("kbd")).toBeNull();
  });

  it("view mode toggle is on its own line (not inline in meta), no ToggleGroup role", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);
    // Toggle lives after the header, not inside the meta line
    const metaLine = screen.getByTestId("article-meta-line");
    expect(metaLine.textContent).not.toContain("Feed");
    expect(metaLine.textContent).not.toContain("Full text");
    // Both options are still present in the document
    expect(screen.getByRole("button", { name: /Feed/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Full text/ })).toBeInTheDocument();
    // No ToggleGroup (role="group") as sibling of header
    const header = document.querySelector("article header");
    expect(header?.nextElementSibling?.getAttribute("role")).not.toBe("group");
  });

  it("article content area has overflow-x-hidden to prevent horizontal scroll", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    const { container } = render(<ReaderPanel />);
    // A wrapper inside the article clips wide feed HTML (tables, pre blocks, etc.)
    // so it never causes horizontal viewport overflow. The sticky nav bar must
    // live OUTSIDE this wrapper so overflow-x-hidden doesn't trap sticky positioning.
    const contentWrapper = container.querySelector("[data-testid='article-content-area']");
    expect(contentWrapper).not.toBeNull();
    expect(contentWrapper!.className).toContain("overflow-x-hidden");
  });

  it("sticky nav bar (mobile) is not inside the overflow-x-hidden content area", () => {
    mockIsDesktop = false;
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
    const contentArea = document.querySelector("[data-testid='article-content-area']");
    const navBar = document.querySelector("[data-testid='nav-pills-bar']");
    expect(contentArea).not.toBeNull();
    expect(navBar).not.toBeNull();
    // nav bar must not be a descendant of the overflow-x-hidden wrapper
    expect(contentArea!.contains(navBar)).toBe(false);
  });

  it("nav pills are rounded-full for floating appearance (mobile)", () => {
    mockIsDesktop = false;
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
    const pill = screen.getByTestId("next-pill");
    expect(pill.className).toContain("rounded-full");
  });

  it("nav pills bar has no border-t (mobile floating, not a separator bar)", () => {
    mockIsDesktop = false;
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
    const bar = screen.getByTestId("nav-pills-bar");
    expect(bar.className).not.toContain("border-t");
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

  describe("mobile navigation pills", () => {
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    const prevArt = { ...mockArticle(), id: "a0", title: "Prev Article" };

    beforeEach(() => {
      // Pills are mobile-only. On desktop the user has the article list
      // panel always visible plus j/k shortcuts — the pills are redundant
      // and clutter the reader. Mobile keeps them as the primary nav
      // affordance since the article list isn't on screen.
      mockIsDesktop = false;
      useArticleStore.setState({
        selectedArticle: mockArticle(),
        articles: [],
        isLoading: false,
      });
    });

    it("does NOT render prev/next pills on desktop", () => {
      mockIsDesktop = true;
      render(
        <ReaderPanel
          nextArticle={nextArt}
          prevArticle={prevArt}
          onNavigate={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("next-pill")).toBeNull();
      expect(screen.queryByTestId("prev-pill")).toBeNull();
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

    it("pills share available space (flex-1) and truncate before overflowing", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} onNavigate={vi.fn()} />);
      // Both pills should grow to fill space (flex-1) and be allowed to shrink (min-w-0)
      // so they truncate their titles instead of overflowing the container.
      const prev = screen.getByTestId("prev-pill");
      const next = screen.getByTestId("next-pill");
      expect(prev.className).toContain("flex-1");
      expect(prev.className).toContain("min-w-0");
      expect(next.className).toContain("flex-1");
      expect(next.className).toContain("min-w-0");
    });

    it("pills are not capped at 35% width", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("prev-pill").className).not.toContain("max-w-[35%]");
      expect(screen.getByTestId("next-pill").className).not.toContain("max-w-[35%]");
    });

    it("back button appears in nav bar when onBack is provided", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} onBack={vi.fn()} />);
      expect(screen.getByTestId("back-pill")).toBeInTheDocument();
    });

    it("clicking back button calls onBack", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} onBack={onBack} />);
      await user.click(screen.getByTestId("back-pill"));
      expect(onBack).toHaveBeenCalledOnce();
    });

    it("back button does not appear when onBack is not provided", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      expect(screen.queryByTestId("back-pill")).toBeNull();
    });

    it("prev pill text is left-aligned (justify-start)", () => {
      render(<ReaderPanel prevArticle={prevArt} onNavigate={vi.fn()} />);
      const pill = screen.getByTestId("prev-pill");
      expect(pill.className).toContain("justify-start");
    });

    it("next pill text is right-aligned (justify-end)", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      const pill = screen.getByTestId("next-pill");
      expect(pill.className).toContain("justify-end");
    });

    it("nav bar is pinned to bottom via flex layout, not sticky", () => {
      // sticky bottom-0 only shows pills when the user scrolls to the end.
      // Desktop nav must be always visible: a flex child below the scroll container.
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      const bar = screen.getByTestId("nav-pills-bar");
      expect(bar.className).not.toContain("sticky");
      // The component owns its scroll container when nav props are provided
      const scrollContainer = document.querySelector(".overflow-y-auto");
      expect(scrollContainer).not.toBeNull();
      // Nav bar is a flex sibling below the scroll container, not inside it
      expect(scrollContainer!.contains(bar)).toBe(false);
    });

    it("pills have backdrop blur and bg for floaty contrast", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} />);
      const pill = screen.getByTestId("next-pill");
      expect(pill.className).toMatch(/backdrop-blur/);
    });
  });

  describe("scroll reset on article change (GitLab #8)", () => {
    const articleA = mockArticle({ id: "a1", title: "Article A" });
    const articleB = mockArticle({
      id: "a2",
      title: "Article B",
      link: "https://example.com/b",
    });

    beforeEach(() => {
      mockIsDesktop = true;
    });

    it("resets reader scroll to top when switching articles", () => {
      useArticleStore.setState({
        selectedArticle: articleA,
        articles: [articleA, articleB],
        isLoading: false,
      });

      const { rerender } = render(
        <ReaderPanel nextArticle={articleB} onNavigate={vi.fn()} />,
      );

      const scrollContainer = document.querySelector(
        "[data-testid='reader-scroll-container']",
      ) as HTMLDivElement | null;
      expect(scrollContainer).not.toBeNull();

      // User scrolls into article A.
      scrollContainer!.scrollTop = 500;
      expect(scrollContainer!.scrollTop).toBe(500);

      // User selects article B (mimicking j/k or click on article list).
      act(() => {
        useArticleStore.setState({ selectedArticle: articleB });
      });

      rerender(<ReaderPanel nextArticle={articleB} onNavigate={vi.fn()} />);

      const scrollAfter = document.querySelector(
        "[data-testid='reader-scroll-container']",
      ) as HTMLDivElement;
      expect(scrollAfter.scrollTop).toBe(0);
    });

    it("loading-state scroll container exposes the same testid as the article container", () => {
      // The reset effect targets a single scroll container by ref. When the
      // panel is in its loading/empty wrap() path, that container must still
      // be discoverable so React reuses it across renders. Without a stable
      // testid both branches share, the user-visible scroll position can leak
      // across the loading→article transition.
      useArticleStore.setState({
        selectedArticle: null,
        articles: [],
        isLoading: true,
      });
      render(<ReaderPanel nextArticle={articleB} onNavigate={vi.fn()} />);
      expect(
        document.querySelector("[data-testid='reader-scroll-container']"),
      ).not.toBeNull();
    });

    it("resets reader scroll to top when transitioning from loading to article", () => {
      // Reproduces GitLab #8 path: loading state renders a scroll container
      // WITHOUT the ref, then the article arrives and a different scroll
      // container is mounted. The new container must start at scrollTop 0
      // even though the previous (refless) one had been scrolled by the user.
      useArticleStore.setState({
        selectedArticle: null,
        articles: [],
        isLoading: true,
      });

      const { rerender } = render(
        <ReaderPanel nextArticle={articleB} onNavigate={vi.fn()} />,
      );

      // Loading-state scroll container (no ref, in wrap()).
      const loadingScrollEl = document
        .querySelectorAll(".overflow-y-auto")[0] as HTMLDivElement | undefined;
      expect(loadingScrollEl).toBeDefined();
      // User had scrolled the previous article before this navigation began.
      loadingScrollEl!.scrollTop = 500;

      // Article arrives.
      act(() => {
        useArticleStore.setState({
          selectedArticle: articleA,
          articles: [articleA, articleB],
          isLoading: false,
        });
      });
      rerender(<ReaderPanel nextArticle={articleB} onNavigate={vi.fn()} />);

      const scrollAfter = document.querySelector(
        "[data-testid='reader-scroll-container']",
      ) as HTMLDivElement;
      expect(scrollAfter.scrollTop).toBe(0);
    });
  });

  describe("mobile navigation pills", () => {
    const nextArt = { ...mockArticle(), id: "a2", title: "Next Article" };
    const prevArt = { ...mockArticle(), id: "a0", title: "Prev Article" };

    beforeEach(() => {
      mockIsDesktop = false;
      useArticleStore.setState({
        selectedArticle: mockArticle(),
        articles: [],
        isLoading: false,
      });
    });

    it("back pill shows only an arrow icon — no Back label on mobile", () => {
      render(<ReaderPanel nextArticle={nextArt} onNavigate={vi.fn()} onBack={vi.fn()} />);
      const pill = screen.getByTestId("back-pill");
      expect(pill.textContent).not.toContain("Back");
    });

    it("prev and next pills do not show kbd hints on mobile", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("prev-pill").querySelector("kbd")).toBeNull();
      expect(screen.getByTestId("next-pill").querySelector("kbd")).toBeNull();
    });

    it("prev and next pills fill available width on mobile (flex-1)", () => {
      render(<ReaderPanel nextArticle={nextArt} prevArticle={prevArt} onNavigate={vi.fn()} />);
      expect(screen.getByTestId("prev-pill").className).toContain("flex-1");
      expect(screen.getByTestId("next-pill").className).toContain("flex-1");
    });
  });
});
