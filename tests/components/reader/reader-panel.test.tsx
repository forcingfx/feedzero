import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";

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
});
