/**
 * Cross-path behavior parity tests for view toggle.
 *
 * Verifies that pressing 'E' key and clicking the Extracted button
 * both produce identical behavior: switching mode AND triggering fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useExtractionStore } from "../../src/stores/extraction-store.ts";
import { useArticleStore } from "../../src/stores/article-store.ts";
import { useKeyboardNav } from "../../src/hooks/use-keyboard-nav.ts";
import type { Article } from "../../src/types/index.ts";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

vi.mock("../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn().mockReturnValue({
    ok: true,
    value: { content: "<p>Extracted</p>", title: "", author: "", excerpt: "" },
  }),
}));

const testArticle: Article = {
  id: "a1",
  feedId: "f1",
  guid: "guid-a1",
  title: "Test Article",
  link: "https://example.com/article",
  content: "<p>Original content</p>",
  summary: "",
  author: "",
  publishedAt: Date.now(),
  read: false,
  createdAt: Date.now(),
};

function pressKey(key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  document.dispatchEvent(event);
}

describe("view toggle behavior parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body><p>Extracted</p></body></html>"),
    }) as unknown as typeof fetch;

    useExtractionStore.setState({
      cache: {},
      viewMode: "feed",
      statusMap: {},
    });
    useArticleStore.setState({
      articles: [testArticle],
      selectedArticle: testArticle,
    });
  });

  it("H key triggers extraction fetch (keyboard path)", () => {
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    pressKey("h");

    expect(useExtractionStore.getState().viewMode).toBe("extracted");
    expect(fetch).toHaveBeenCalledWith("/api/page", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/article" }),
    }));
  });

  it("switchToExtracted triggers extraction fetch (click path)", () => {
    // Simulates what handleModeChange does when user clicks Extracted button
    useExtractionStore.getState().switchToExtracted(testArticle.link);

    expect(useExtractionStore.getState().viewMode).toBe("extracted");
    expect(fetch).toHaveBeenCalledWith("/api/page", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/article" }),
    }));
  });

  it("both paths use identical fetch URL encoding", () => {
    // Keyboard path
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
    pressKey("h");
    const keyboardFetchUrl = vi.mocked(fetch).mock.calls[0][0];

    // Reset for click path
    vi.mocked(fetch).mockClear();
    useExtractionStore.setState({ viewMode: "feed", cache: {} });

    // Click path
    useExtractionStore.getState().switchToExtracted(testArticle.link);
    const clickFetchUrl = vi.mocked(fetch).mock.calls[0][0];

    expect(keyboardFetchUrl).toBe(clickFetchUrl);
  });

  it("both paths skip fetch when content is cached", () => {
    useExtractionStore.setState({
      cache: { [testArticle.link]: "<p>Cached</p>" },
      viewMode: "feed",
      statusMap: {},
    });

    // Keyboard path
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
    pressKey("h");
    expect(fetch).not.toHaveBeenCalled();
    expect(useExtractionStore.getState().viewMode).toBe("extracted");

    // Reset
    useExtractionStore.setState({ viewMode: "feed" });
    vi.mocked(fetch).mockClear();

    // Click path
    useExtractionStore.getState().switchToExtracted(testArticle.link);
    expect(fetch).not.toHaveBeenCalled();
    expect(useExtractionStore.getState().viewMode).toBe("extracted");
  });

  it("both paths toggle back to feed mode without fetching", () => {
    useExtractionStore.setState({ viewMode: "extracted" });

    // Keyboard path
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
    pressKey("h");
    expect(useExtractionStore.getState().viewMode).toBe("feed");
    expect(fetch).not.toHaveBeenCalled();

    // Reset
    useExtractionStore.setState({ viewMode: "extracted" });

    // Click path (via setViewMode, which is what handleModeChange calls for "feed")
    useExtractionStore.getState().setViewMode("feed");
    expect(useExtractionStore.getState().viewMode).toBe("feed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
