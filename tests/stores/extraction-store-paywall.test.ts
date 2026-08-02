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

// A gated stub body: the publisher served *something* but it extracts to
// nothing. Used to model an authenticated retry that still can't read the
// article (expired cookie).
const STUB_HTML = `
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
    // Default: extraction yields nothing. Individual tests that model a
    // readable body override this. (clearAllMocks resets call history but
    // not return values, so set the default here every test.)
    vi.mocked(extract).mockReturnValue(err("no extraction"));
  });

  // A 200 response is never treated as a paywall from its content. FeedZero
  // stopped guessing at paywalls from page text (phrase lists, body-length)
  // because it false-positived on free articles whose chrome shipped
  // "Subscribe" CTAs (issue #211, ADR 028). Whatever extracts is the article;
  // an empty extraction is a plain failure, not a gate.
  describe("a 200 proxy response is never content-flagged as paywalled", () => {
    it("caches a readable article and records no verdict", async () => {
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

    // Regression: issue #211. Many free articles (Wired, NYT, lttlabs, …)
    // ship industry-standard "Subscribe" CTAs in their nav/footer/newsletter
    // chrome. Detection must never phrase-match that chrome.
    it("renders a readable article even when page chrome contains subscribe CTAs (#211)", async () => {
      const extractedArticle =
        "<article>" +
        "<p>A real, readable paragraph of the article body. </p>".repeat(40) +
        "</article>";
      const pageWithChrome = `
        <html><body>
          <nav><a href="/subscribe">Subscribe</a></nav>
          ${extractedArticle}
          <footer>
            <p>Subscribe to continue reading our award-winning journalism.</p>
            <a href="/login">Already a subscriber?</a>
          </footer>
        </body></html>
      `;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(pageWithChrome),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: { content: extractedArticle, title: "", author: "", excerpt: "" },
      });
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://www.wired.com/story/free-article");

      const state = useExtractionStore.getState();
      expect(
        state.paywallMap["https://www.wired.com/story/free-article"],
      ).toBeUndefined();
      expect(state.cache["https://www.wired.com/story/free-article"]).toBe(
        extractedArticle,
      );
      expect(
        state.statusMap["https://www.wired.com/story/free-article"],
      ).toBe("available");
    });

    // Regression: issue #211. A genuinely short but free post must still
    // render — the old `body-too-short` heuristic used to flag it as gated.
    it("renders a short but free article with no gate phrases (#211)", async () => {
      const html =
        "<html><body><article><p>Tiny but completely free post.</p></article></body></html>";
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      }) as unknown as typeof fetch;
      vi.mocked(extract).mockReturnValue({
        ok: true,
        value: {
          content: "<p>Tiny but completely free post.</p>",
          title: "",
          author: "",
          excerpt: "",
        },
      });
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://blog.example.com/tiny");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://blog.example.com/tiny"]).toBeUndefined();
      expect(state.cache["https://blog.example.com/tiny"]).toBe(
        "<p>Tiny but completely free post.</p>",
      );
    });

    it("marks a 200 response that extracts to nothing as a plain failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(STUB_HTML),
      }) as unknown as typeof fetch;
      useExtensionStore.setState({ status: "absent" });

      await useExtractionStore
        .getState()
        .fetchExtracted("https://nytimes.com/stub-200");

      const state = useExtractionStore.getState();
      expect(state.paywallMap["https://nytimes.com/stub-200"]).toBeUndefined();
      expect(state.statusMap["https://nytimes.com/stub-200"]).toBe("failed");
      expect(fetchArticle).not.toHaveBeenCalled();
    });
  });

  describe("authenticated retry through the extension", () => {
    it("calls the extension's fetchArticle when authorized and re-extracts a readable response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(
        ok({ html: FULL_HTML, finalUrl: "https://nytimes.com/article-3", status: 200 }),
      );
      // The authenticated FULL_HTML extracts to the full body.
      vi.mocked(extract).mockImplementation((html: string) =>
        html === FULL_HTML
          ? {
              ok: true,
              value: {
                content: "<p>Authenticated full article</p>",
                title: "",
                author: "",
                excerpt: "",
              },
            }
          : err("no extraction"),
      );
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

    it("flips the paywall verdict to session-expired when the authenticated body still won't extract", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(""),
      }) as unknown as typeof fetch;
      vi.mocked(fetchArticle).mockResolvedValue(
        ok({ html: STUB_HTML, finalUrl: "https://nytimes.com/article-4", status: 200 }),
      );
      // extract default (err) models a still-gated body after the retry.
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
        ok: false,
        status: 403,
        text: () => Promise.resolve(""),
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
      expect(state.paywallMap["https://nytimes.com/article-5"]).toMatchObject({
        paywalled: true,
        reason: "http-403",
      });
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
        reason: "http-403",
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
            reason: "http-403",
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
