import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { useExtensionStore } from "@/stores/extension-store.ts";
import { ok, err } from "@feedzero/core/utils/result";

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

vi.mock("@/core/extension/protocol.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/extension/protocol.ts")>();
  return {
    ...actual,
    ping: vi.fn(),
    authorizePublisher: vi.fn(),
    fetchArticle: vi.fn(),
  };
});

import { extract } from "@/core/extractor/extractor.ts";
import { fetchArticle } from "@/core/extension/protocol.ts";

const PAYWALL_HTML = `
  <html><body>
    <article><p>Free teaser only.</p></article>
    <div class="gate"><h2>Subscribe to read</h2><a href="/login">Already a subscriber?</a></div>
  </body></html>
`;

const FULL_HTML = `
  <html><body>
    <article>${"<p>Full article paragraph. </p>".repeat(80)}</article>
  </body></html>
`;

function resetExtraction() {
  useExtractionStore.setState({
    cache: {},
    viewMode: "feed",
    statusMap: {},
    paywallMap: {},
  });
}

function resetExtension() {
  useExtensionStore.setState({
    status: "unknown",
    extensionVersion: null,
    authorizedDomains: [],
    authorizationInFlight: null,
  });
}

describe("extraction-store paywall handling", () => {
  beforeEach(() => {
    resetExtraction();
    resetExtension();
    vi.clearAllMocks();
  });

  describe("paywall detection on proxy fetch", () => {
    it("records a paywall verdict when the proxy returns paywalled HTML and the extension is absent", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(PAYWALL_HTML),
      }) as unknown as typeof fetch;
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/article-1");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://nytimes.com/article-1"]).toMatchObject({
        paywalled: true,
        publisher: "nytimes.com",
      });
      expect(state.statusMap["https://nytimes.com/article-1"]).toBe("failed");
      expect(fetchArticle).not.toHaveBeenCalled();
    });

    it("records a paywall verdict and skips extension fetch when installed but publisher is not authorized", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(PAYWALL_HTML),
      }) as unknown as typeof fetch;
      useExtensionStore.setState({ status: "installed", authorizedDomains: [] });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/article-2");

      expect(fetchArticle).not.toHaveBeenCalled();
      expect(
        useExtractionStore.getState().paywallMap["https://nytimes.com/article-2"]
          ?.paywalled,
      ).toBe(true);
    });

    it("does not record a verdict when the proxy returns a fully readable article", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(FULL_HTML),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: { content: "<p>Full</p>", title: "", author: "", excerpt: "" },
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/free");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://example.com/free"]).toBeUndefined();
      expect(state.cache["https://example.com/free"]).toBe("<p>Full</p>");
    });
  });

  describe("authenticated retry through the extension", () => {
    it("calls the extension's fetchArticle when authorized and re-extracts on a non-paywalled response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(PAYWALL_HTML),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(
        ok({ html: FULL_HTML, finalUrl: "https://nytimes.com/article-3", status: 200 }),
      );
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: { content: "<p>Authenticated full article</p>", title: "", author: "", excerpt: "" },
      });
      useExtensionStore.setState({
        status: "installed",
        authorizedDomains: ["nytimes.com"],
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/article-3");

      await waitFor(() => {
        expect(fetchArticle).toHaveBeenCalledWith("https://nytimes.com/article-3");
      });

      const state = useExtractionStore.getState();
      expect(state.cache["https://nytimes.com/article-3"]).toBe(
        "<p>Authenticated full article</p>",
      );
      expect(state.statusMap["https://nytimes.com/article-3"]).toBe("available");
      expect(state.paywallMap["https://nytimes.com/article-3"]).toBeUndefined();
    });

    it("flips the paywall verdict to session-expired when the extension returns a still-gated body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(PAYWALL_HTML),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(
        ok({ html: PAYWALL_HTML, finalUrl: "https://nytimes.com/article-4", status: 200 }),
      );
      useExtensionStore.setState({
        status: "installed",
        authorizedDomains: ["nytimes.com"],
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/article-4");

      await waitFor(() => {
        expect(fetchArticle).toHaveBeenCalled();
      });

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://nytimes.com/article-4"]).toMatchObject({
        paywalled: true,
        publisher: "nytimes.com",
        reason: "session-expired",
      });
      expect(state.statusMap["https://nytimes.com/article-4"]).toBe("failed");
    });

    it("falls back to the original paywall verdict when the extension fetch errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(PAYWALL_HTML),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(err("network-error"));
      useExtensionStore.setState({
        status: "installed",
        authorizedDomains: ["nytimes.com"],
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/article-5");

      await waitFor(() => expect(fetchArticle).toHaveBeenCalled());

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://nytimes.com/article-5"]?.paywalled).toBe(
        true,
      );
      expect(state.statusMap["https://nytimes.com/article-5"]).toBe("failed");
    });
  });

  describe("non-ok proxy responses (publisher refuses anonymous fetch)", () => {
    it("records a paywall verdict when the proxy returns 403 for a known publisher", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/forbidden");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://nytimes.com/forbidden"]).toMatchObject({
        paywalled: true,
        publisher: "nytimes.com",
      });
      expect(state.statusMap["https://nytimes.com/forbidden"]).toBe("failed");
      expect(fetchArticle).not.toHaveBeenCalled();
    });

    it("records a paywall verdict on a 401 too", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://www.economist.com/unauth");

      expect(
        useExtractionStore.getState().paywallMap["https://www.economist.com/unauth"]
          ?.paywalled,
      ).toBe(true);
    });

    it("does NOT record a verdict on a 404 (genuine missing page) — stays a plain failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/gone");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://example.com/gone"]).toBeUndefined();
      expect(state.statusMap["https://example.com/gone"]).toBe("failed");
    });

    it("does NOT record a verdict on a 503 (transient server error)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;

      await useExtractionStore
        .getState()
        .fetchExtracted("https://example.com/down");

      expect(
        useExtractionStore.getState().paywallMap["https://example.com/down"],
      ).toBeUndefined();
    });

    it("retries via the extension on a 403 when the publisher is authorized", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(
        ok({ html: FULL_HTML, finalUrl: "https://nytimes.com/auth", status: 200 }),
      );
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: { content: "<p>Authenticated body</p>", title: "", author: "", excerpt: "" },
      });
      useExtensionStore.setState({
        status: "installed",
        authorizedDomains: ["nytimes.com"],
      });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/auth");

      await waitFor(() => expect(fetchArticle).toHaveBeenCalledWith("https://nytimes.com/auth"));

      const state = useExtractionStore.getState();
      expect(state.cache["https://nytimes.com/auth"]).toBe("<p>Authenticated body</p>");
      expect(state.statusMap["https://nytimes.com/auth"]).toBe("available");
    });
  });

  describe("getPaywallVerdict selector", () => {
    it("returns null when the URL has no recorded verdict", () => {
      expect(
        useExtractionStore.getState().getPaywallVerdict("https://nope.com"),
      ).toBeNull();
    });

    it("returns the recorded verdict when one exists", () => {
      useExtractionStore.setState({
        paywallMap: {
          "https://nytimes.com/x": {
            paywalled: true,
            publisher: "nytimes.com",
            reason: "phrase-match",
          },
        },
      });

      const verdict = useExtractionStore
        .getState()
        .getPaywallVerdict("https://nytimes.com/x");
      expect(verdict).toMatchObject({ paywalled: true, publisher: "nytimes.com" });
    });
  });
});
