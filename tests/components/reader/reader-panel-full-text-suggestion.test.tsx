/**
 * Asking for full text by hand on a second article of the same feed
 * offers to make full text that feed's default (owner request, 2026-11).
 * The counting rules live in tests/lib/suggest-always-full-text.test.ts;
 * this covers the wiring: a tap counts, an automatic switch does not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { resetFullTextRequestSession } from "@/lib/suggest-always-full-text.ts";

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  updateArticle: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn().mockResolvedValue({ ok: false, error: "offline" }),
  needsExtraction: vi.fn().mockReturnValue(false),
}));

vi.mock("@/hooks/use-media-query.ts", () => ({ useIsDesktop: () => true }));

const article = (id: string) => ({
  id,
  feedId: "f1",
  guid: id,
  title: `Article ${id}`,
  link: `https://example.com/${id}`,
  content: "<p>Feed text of the article.</p>",
  summary: "",
  author: "",
  publishedAt: Date.now(),
  read: true,
  createdAt: Date.now(),
});

const feed = (overrides: Record<string, unknown> = {}) => ({
  id: "f1",
  url: "https://example.com/feed",
  title: "Example News",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

function open(id: string) {
  act(() => {
    useArticleStore.setState({ selectedArticle: article(id) as never, isLoading: false });
  });
}

describe("ReaderPanel full text suggestion", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    localStorage.clear();
    resetFullTextRequestSession();
    useExtractionStore.setState({ cache: {}, statusMap: {}, paywallMap: {}, viewMode: "feed" });
    useFeedStore.setState({ feeds: [feed()] as never, folders: [], selectedFeedId: "f1" });
    useArticleStore.setState({ articles: [], selectedArticle: null, isLoading: false });
  });

  it("offers the feed-wide setting on the second article the reader taps Full text on", async () => {
    const user = userEvent.setup();
    render(<ReaderPanel />);

    open("a1");
    await user.click(screen.getByRole("button", { name: /full text/i }));
    expect(toast).not.toHaveBeenCalled();

    open("a2");
    await user.click(screen.getByRole("button", { name: /full text/i }));

    expect(toast).toHaveBeenCalledWith(
      "Always open Example News in full text?",
      expect.objectContaining({ action: expect.objectContaining({ label: "Always" }) }),
    );
  });

  it("does not count articles the app switched to full text by itself", () => {
    useFeedStore.setState({ feeds: [feed({ preferFullText: true })] as never });
    render(<ReaderPanel />);

    open("a1");
    open("a2");
    open("a3");

    expect(toast).not.toHaveBeenCalled();
  });
});
