import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExtractionStore } from "../../src/stores/extraction-store.ts";

vi.mock("../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

import { extract } from "../../src/core/extractor/extractor.ts";

describe("extraction-store", () => {
  beforeEach(() => {
    useExtractionStore.setState({
      cache: {},
      viewMode: "feed",
      isExtracting: false,
    });
    vi.clearAllMocks();
  });

  it("starts in feed mode with empty cache", () => {
    const s = useExtractionStore.getState();
    expect(s.viewMode).toBe("feed");
    expect(s.cache).toEqual({});
    expect(s.isExtracting).toBe(false);
  });

  describe("setViewMode", () => {
    it("switches view mode", () => {
      useExtractionStore.getState().setViewMode("extracted");
      expect(useExtractionStore.getState().viewMode).toBe("extracted");
    });
  });

  describe("fetchExtracted", () => {
    it("fetches and caches extracted content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve("<html><body><p>Full article</p></body></html>"),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: {
          content: "<p>Full article</p>",
          title: "Title",
          author: "",
          excerpt: "",
        },
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/post");

      const s = useExtractionStore.getState();
      expect(s.cache["https://example.com/post"]).toBe("<p>Full article</p>");
      expect(s.isExtracting).toBe(false);
    });

    it("returns cached content without refetching", async () => {
      useExtractionStore.setState({
        cache: { "https://example.com/post": "<p>cached</p>" },
        viewMode: "feed",
        isExtracting: false,
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/post");

      expect(fetch).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });

    it("handles fetch failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as unknown as typeof fetch;

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/bad");

      const s = useExtractionStore.getState();
      expect(s.cache["https://example.com/bad"]).toBeUndefined();
      expect(s.isExtracting).toBe(false);
    });

    it("handles extraction failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({ ok: false, error: "No content" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/empty");

      expect(
        useExtractionStore.getState().cache["https://example.com/empty"],
      ).toBeUndefined();
    });
  });

  describe("resetForArticle", () => {
    it("resets view mode but preserves cache", () => {
      useExtractionStore.setState({
        cache: { "https://a.com": "<p>a</p>" },
        viewMode: "extracted",
        isExtracting: false,
      });

      useExtractionStore.getState().resetForArticle();

      const s = useExtractionStore.getState();
      expect(s.viewMode).toBe("feed");
      expect(s.cache["https://a.com"]).toBe("<p>a</p>");
    });
  });

  describe("switchToExtracted", () => {
    it("sets view mode to extracted and triggers fetch", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body><p>Content</p></body></html>"),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: {
          content: "<p>Content</p>",
          title: "",
          author: "",
          excerpt: "",
        },
      });

      useExtractionStore
        .getState()
        .switchToExtracted("https://example.com/post");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      expect(fetch).toHaveBeenCalledWith(
        "/api/page?url=https%3A%2F%2Fexample.com%2Fpost",
      );
    });

    it("does not fetch if content is already cached", () => {
      useExtractionStore.setState({
        cache: { "https://example.com/post": "<p>Cached</p>" },
        viewMode: "feed",
        isExtracting: false,
      });

      useExtractionStore
        .getState()
        .switchToExtracted("https://example.com/post");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("does not fetch if no article link provided", () => {
      useExtractionStore.getState().switchToExtracted(undefined);

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("toggleViewMode", () => {
    it("switches from feed to extracted and triggers fetch", () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body><p>Content</p></body></html>"),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: {
          content: "<p>Content</p>",
          title: "",
          author: "",
          excerpt: "",
        },
      });

      useExtractionStore.getState().toggleViewMode("https://example.com/post");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      expect(fetch).toHaveBeenCalled();
    });

    it("switches from extracted back to feed without fetching", () => {
      useExtractionStore.setState({
        cache: {},
        viewMode: "extracted",
        isExtracting: false,
      });

      useExtractionStore.getState().toggleViewMode("https://example.com/post");

      expect(useExtractionStore.getState().viewMode).toBe("feed");
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
