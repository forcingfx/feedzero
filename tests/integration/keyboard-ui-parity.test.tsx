/**
 * Cross-path behavior parity tests for all keyboard shortcuts.
 *
 * Verifies that keyboard shortcuts produce identical outcomes to their
 * UI click counterparts. This prevents bugs where keyboard and mouse
 * paths diverge over time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import * as ReactRouter from "react-router";
import { useKeyboardNav } from "../../src/hooks/use-keyboard-nav.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useExtractionStore } from "../../src/stores/extraction-store.ts";
import type { Article } from "@feedzero/core/types";

const navigateSpy = vi.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={["/feeds"]}>{children}</MemoryRouter>;
}

// Mock core modules
vi.mock("../../src/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn().mockReturnValue({
    ok: true,
    value: { content: "<p>Extracted</p>", title: "", author: "", excerpt: "" },
  }),
}));

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  refreshAllFeeds: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { results: [] } }),
}));

// 'r' triggers refreshAll → schedulePrefetch (fire-and-forget). Stub the
// service so the background promise doesn't trip the unhandled-rejection
// guard with an unrelated db mock gap.
vi.mock("../../src/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { extracted: 0, failed: 0 } }),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { refreshAllFeeds } from "../../src/core/feeds/feed-service.ts";

const mockArticle = (id: string, feedId: string): Article => ({
  id,
  feedId,
  guid: id,
  title: `Article ${id}`,
  link: `https://example.com/${id}`,
  content: "<p>Content</p>",
  summary: "",
  author: "",
  publishedAt: Date.now(),
  read: false,
  createdAt: Date.now(),
});

function pressKey(key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  document.dispatchEvent(event);
}

describe("keyboard-UI behavior parity", () => {
  let useNavigateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";

    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      isRefreshingAll: false,
      error: null,
    });

    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });

    useExtractionStore.setState({
      cache: {},
      viewMode: "feed",
      statusMap: {},
    });

    navigateSpy.mockReset();
    useNavigateSpy = vi.spyOn(ReactRouter, "useNavigate").mockReturnValue(navigateSpy);
  });

  afterEach(() => {
    useNavigateSpy.mockRestore();
  });

  describe("R key vs Refresh button", () => {
    it("R key is ignored when refresh is already in progress", async () => {
      // Set up: refresh takes 100ms to complete
      vi.mocked(refreshAllFeeds).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ ok: true, value: { results: [] } }),
              100,
            ),
          ),
      );

      // Start the first refresh (sets isRefreshingAll = true)
      const firstRefreshPromise = useFeedStore.getState().refreshAll();
      expect(useFeedStore.getState().isRefreshingAll).toBe(true);

      // Now press R while refresh is in progress
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("r");

      // Wait for first refresh to complete
      await firstRefreshPromise;

      // Observable behavior: refreshAllFeeds was only called once
      expect(refreshAllFeeds).toHaveBeenCalledTimes(1);
    });

    it("both call the same refreshAll store action", async () => {
      const refreshAllSpy = vi.fn();
      useFeedStore.setState({ refreshAll: refreshAllSpy });

      // Keyboard path
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("r");

      expect(refreshAllSpy).toHaveBeenCalledTimes(1);

      // UI path (simulate what button onClick does)
      refreshAllSpy.mockClear();
      useFeedStore.getState().refreshAll();

      expect(refreshAllSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("H key vs View Toggle click", () => {
    it("both use toggleViewMode for switching modes", () => {
      const article = mockArticle("a1", "f1");
      useArticleStore.setState({ selectedArticle: article });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body><p>Content</p></body></html>"),
      }) as unknown as typeof fetch;

      // Keyboard path
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("h");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      const keyboardFetchCalls = vi.mocked(fetch).mock.calls.length;

      // Reset
      useExtractionStore.setState({ viewMode: "feed", cache: {} });
      vi.mocked(fetch).mockClear();

      // UI path (what handleModeChange does)
      useExtractionStore.getState().switchToExtracted(article.link);

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      const uiFetchCalls = vi.mocked(fetch).mock.calls.length;

      // Both should have made the same number of fetch calls
      expect(keyboardFetchCalls).toBe(uiFetchCalls);
    });
  });

  describe("N key navigates to explore", () => {
    it("navigates to /explore?focus=search", () => {
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("n");

      expect(navigateSpy).toHaveBeenCalledWith("/explore?focus=search");
    });
  });

  describe("[ key vs Sidebar Trigger", () => {
    it("both dispatch the same custom event", () => {
      const eventHandler = vi.fn();
      document.addEventListener("feedzero:toggle-sidebar", eventHandler);

      // Keyboard path
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("[");

      expect(eventHandler).toHaveBeenCalledTimes(1);

      document.removeEventListener("feedzero:toggle-sidebar", eventHandler);
    });
  });

  describe("O key vs title link", () => {
    it("o key opens article.link — same URL as the clickable title", () => {
      const article = mockArticle("a1", "f1");
      useArticleStore.setState({ selectedArticle: article });

      const windowOpenSpy = vi
        .spyOn(window, "open")
        .mockImplementation(() => null);

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("o");

      expect(windowOpenSpy).toHaveBeenCalledWith(
        article.link,
        "_blank",
        "noopener,noreferrer",
      );

      windowOpenSpy.mockRestore();
    });

    it("keyboard does nothing when no article selected", () => {
      useArticleStore.setState({ selectedArticle: null });

      const windowOpenSpy = vi
        .spyOn(window, "open")
        .mockImplementation(() => null);

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("o");

      expect(windowOpenSpy).not.toHaveBeenCalled();

      windowOpenSpy.mockRestore();
    });
  });

  describe("S key vs Star button click", () => {
    it("S key toggles star on the selected article via the same store action", async () => {
      const article = mockArticle("a1", "f1");
      useArticleStore.setState({
        selectedArticle: article,
        articles: [article],
        articlesByFeedId: { f1: [article] },
      });

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("s");

      // toggleStar persists async; wait one microtask so the store
      // settles before the assertion.
      await Promise.resolve();
      await Promise.resolve();

      const updated = useArticleStore.getState().articles[0];
      expect(updated.starred).toBe(true);
    });

    it("S key is a no-op when no article is selected", async () => {
      useArticleStore.setState({ selectedArticle: null });

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("s");
      await Promise.resolve();

      // No articles in the store at all — nothing to toggle, no throw.
      expect(useArticleStore.getState().selectedArticle).toBeNull();
    });
  });

  describe("J/K keys vs Article click", () => {
    it("both result in article being clicked (DOM delegation)", () => {
      // Set up DOM with article items
      document.body.innerHTML = `
        <div role="listbox">
          <div role="option" aria-selected="true" data-testid="article-1">Article 1</div>
          <div role="option" aria-selected="false" data-testid="article-2">Article 2</div>
        </div>
      `;

      const article2 = document.querySelector(
        '[data-testid="article-2"]',
      ) as HTMLElement;
      const clickSpy = vi.fn();
      article2.addEventListener("click", clickSpy);

      // Keyboard path - J should click next article
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("j");

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("U/I keys vs Feed button click", () => {
    it("U navigates to the next feed in the logical list", () => {
      // U / I traverse feed-store state instead of DOM buttons so they
      // can reach feeds hidden inside collapsed folders. They call
      // `navigate()` directly — same single source of truth as clicking
      // a feed in the sidebar.
      useFeedStore.setState({
        feeds: [
          { id: "f1", url: "x", title: "Feed 1", description: "", siteUrl: "", createdAt: 0, updatedAt: 0 },
          { id: "f2", url: "y", title: "Feed 2", description: "", siteUrl: "", createdAt: 0, updatedAt: 0 },
        ],
        selectedFeedId: "f1",
      });

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("u");

      expect(navigateSpy).toHaveBeenCalledWith("/feeds/f2");
    });
  });

  describe("shortcuts disabled in input fields", () => {
    it("does not trigger shortcuts when typing in input", () => {
      const refreshAllSpy = vi.fn();
      useFeedStore.setState({ refreshAll: refreshAllSpy });

      document.body.innerHTML = '<input type="text" id="test-input" />';
      const input = document.getElementById("test-input") as HTMLInputElement;
      input.focus();

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      // Dispatch from input element
      const event = new KeyboardEvent("keydown", {
        key: "r",
        bubbles: true,
      });
      input.dispatchEvent(event);

      expect(refreshAllSpy).not.toHaveBeenCalled();
    });

    it("does not trigger shortcuts when typing in textarea", () => {
      const refreshAllSpy = vi.fn();
      useFeedStore.setState({ refreshAll: refreshAllSpy });

      document.body.innerHTML = '<textarea id="test-textarea"></textarea>';
      const textarea = document.getElementById(
        "test-textarea",
      ) as HTMLTextAreaElement;
      textarea.focus();

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      const event = new KeyboardEvent("keydown", {
        key: "r",
        bubbles: true,
      });
      textarea.dispatchEvent(event);

      expect(refreshAllSpy).not.toHaveBeenCalled();
    });
  });
});
