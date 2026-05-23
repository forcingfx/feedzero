import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
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
      statusMap: {},
    });
    vi.clearAllMocks();
  });

  it("starts in feed mode with empty cache", () => {
    const s = useExtractionStore.getState();
    expect(s.viewMode).toBe("feed");
    expect(s.cache).toEqual({});
    expect(Object.keys(s.statusMap).length).toBe(0);
  });

  describe("setViewMode", () => {
    it("switches view mode", () => {
      useExtractionStore.getState().setViewMode("extracted");
      expect(useExtractionStore.getState().viewMode).toBe("extracted");
    });
  });

  describe("fetchExtracted", () => {
    it("fetches and caches extracted content", async () => {
      // Long body so the default paywall detector's body-too-short
      // heuristic does not flag this as gated.
      const fullHtml = `<html><body><article>${"<p>Full readable article paragraph. </p>".repeat(40)}</article></body></html>`;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(fullHtml),
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
      expect(s.statusMap["https://example.com/post"]).toBe("available");
    });

    it("returns cached content without refetching", async () => {
      useExtractionStore.setState({
        cache: { "https://example.com/post": "<p>cached</p>" },
        viewMode: "feed",
        statusMap: {},
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
      expect(s.statusMap["https://example.com/bad"]).toBe("failed");
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
        statusMap: {},
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

      // viewMode flips synchronously.
      expect(useExtractionStore.getState().viewMode).toBe("extracted");
      // The extractor + adapter registry are lazy-loaded (so Defuddle
      // stays out of the first-paint bundle). The fetch fires after
      // both dynamic imports resolve — wait for it.
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/page",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ url: "https://example.com/post" }),
          }),
        );
      });
    });

    it("does not fetch if content is already cached", () => {
      useExtractionStore.setState({
        cache: { "https://example.com/post": "<p>Cached</p>" },
        viewMode: "feed",
        statusMap: {},
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
    it("switches from feed to extracted and triggers fetch", async () => {
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
      await waitFor(() => expect(fetch).toHaveBeenCalled());
    });

    it("switches from extracted back to feed without fetching", () => {
      useExtractionStore.setState({
        cache: {},
        viewMode: "extracted",
        statusMap: {},
      });

      useExtractionStore.getState().toggleViewMode("https://example.com/post");

      expect(useExtractionStore.getState().viewMode).toBe("feed");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("cache eviction", () => {
    it("evicts oldest entries when cache exceeds max size", async () => {
      // Pre-fill cache with 50 entries
      const cache: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        cache[`https://example.com/${i}`] = `content-${i}`;
      }
      useExtractionStore.setState({ cache });

      // Mock a successful extraction for one more. Long body so the
      // default paywall detector does not flag this as a stub.
      const longHtml = `<article>${"<p>Long readable paragraph. </p>".repeat(40)}</article>`;
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(longHtml, { status: 200 }),
      );
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: { content: "new-content", title: "", author: "", excerpt: "" },
      });

      await useExtractionStore.getState().fetchExtracted("https://example.com/new");

      const state = useExtractionStore.getState();
      expect(state.cache["https://example.com/new"]).toBe("new-content");
      expect(Object.keys(state.cache).length).toBeLessThanOrEqual(50);
      // Oldest entry should be evicted
      expect(state.cache["https://example.com/0"]).toBeUndefined();
    });

    it("evicts entries older than the TTL when a new entry is added", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      try {
        // Seed an entry by going through the public extraction path so
        // its timestamp is recorded by the eviction metadata.
        const longHtml = `<article>${"<p>Old readable paragraph. </p>".repeat(40)}</article>`;
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response(longHtml, { status: 200 }),
        );
        vi.mocked(extract).mockReturnValueOnce({
          ok: true,
          value: { content: "old-content", title: "", author: "", excerpt: "" },
        });
        await useExtractionStore
          .getState()
          .fetchExtracted("https://example.com/old");
        expect(useExtractionStore.getState().cache["https://example.com/old"]).toBe(
          "old-content",
        );

        // Advance past the 30-minute TTL.
        vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));

        const freshHtml = `<article>${"<p>Fresh readable paragraph. </p>".repeat(40)}</article>`;
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response(freshHtml, { status: 200 }),
        );
        vi.mocked(extract).mockReturnValueOnce({
          ok: true,
          value: { content: "fresh-content", title: "", author: "", excerpt: "" },
        });
        await useExtractionStore
          .getState()
          .fetchExtracted("https://example.com/fresh");

        const state = useExtractionStore.getState();
        expect(state.cache["https://example.com/fresh"]).toBe("fresh-content");
        expect(state.cache["https://example.com/old"]).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("evicts oldest entries when cumulative cache bytes exceed the size cap", async () => {
      // Two MB body + new entry will exceed the 5 MB cap when added 3x.
      const bigBody = "x".repeat(2 * 1024 * 1024);
      // Match the paywall-detector-friendly body shape used elsewhere
      // in this file — long enough to clear the "body too short" heuristic.
      const fullHtml = `<html><body><article>${"<p>Full readable article paragraph. </p>".repeat(40)}</article></body></html>`;
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      async function pump(url: string, content: string) {
        fetchMock.mockResolvedValueOnce(
          new Response(fullHtml, { status: 200 }),
        );
        vi.mocked(extract).mockReturnValueOnce({
          ok: true,
          value: { content, title: "", author: "", excerpt: "" },
        });
        await useExtractionStore.getState().fetchExtracted(url);
      }

      await pump("https://example.com/a", bigBody);
      await pump("https://example.com/b", bigBody);
      await pump("https://example.com/c", bigBody);

      const state = useExtractionStore.getState();
      // The oldest 2 MB entry must be evicted to keep totals under 5 MB.
      expect(state.cache["https://example.com/c"]).toBe(bigBody);
      expect(state.cache["https://example.com/a"]).toBeUndefined();
    });
  });
});
