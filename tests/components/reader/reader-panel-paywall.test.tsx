import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { useExtensionStore } from "@/stores/extension-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  updateArticle: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
  needsExtraction: vi.fn().mockReturnValue(false),
}));

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => mockIsDesktop,
}));

function mockArticle() {
  return {
    id: "a1",
    feedId: "f1",
    guid: "a1",
    title: "Paywalled Article",
    link: "https://nytimes.com/article-x",
    content: "<p>Teaser.</p>",
    summary: "Short",
    author: "",
    publishedAt: Date.now(),
    read: true,
    createdAt: Date.now(),
  };
}

describe("ReaderPanel paywall integration", () => {
  beforeEach(() => {
    mockIsDesktop = true;
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    useExtractionStore.setState({
      cache: {},
      statusMap: {},
      paywallMap: {},
      viewMode: "feed",
    });
    useExtensionStore.setState({
      status: "absent",
      extensionVersion: null,
      authorizedDomains: [],
      authorizationInFlight: null,
    });
    // These tests assert on the extension CTAs (install / authorize /
    // session-expired), which are gated behind VITE_EXTENSION_ENABLED.
    // Enable it so the extension-shipped behaviour is exercised.
    vi.stubEnv("VITE_EXTENSION_ENABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders PaywallPrompt when in extracted view with a recorded paywall verdict", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);

    // resetForArticle in the layout effect flips viewMode back to "feed";
    // set the extracted view + verdict after first render.
    act(() => {
      useExtractionStore.setState({
        cache: {},
        statusMap: { "https://nytimes.com/article-x": "failed" },
        paywallMap: {
          "https://nytimes.com/article-x": {
            paywalled: true,
            publisher: "nytimes.com",
            reason: "phrase-match",
          },
        },
        viewMode: "extracted",
      });
    });

    const prompt = screen.getByRole("region", { name: /paywall prompt/i });
    expect(prompt).toBeInTheDocument();
    // Scoped to the prompt to avoid colliding with the article-title heading.
    expect(
      prompt.querySelector("h3"),
    ).toHaveTextContent(/paywalled article/i);
  });

  it("does NOT render PaywallPrompt when in feed view (only on the extracted side)", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });
    useExtractionStore.setState({
      cache: {},
      statusMap: { "https://nytimes.com/article-x": "failed" },
      paywallMap: {
        "https://nytimes.com/article-x": {
          paywalled: true,
          publisher: "nytimes.com",
          reason: "phrase-match",
        },
      },
      viewMode: "feed",
    });

    render(<ReaderPanel />);

    expect(
      screen.queryByRole("region", { name: /paywall prompt/i }),
    ).not.toBeInTheDocument();
  });

  it("surfaces session-expired copy when the verdict reason is session-expired", () => {
    useExtensionStore.setState({
      status: "installed",
      authorizedDomains: ["nytimes.com"],
    });
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);

    act(() => {
      useExtractionStore.setState({
        cache: {},
        statusMap: { "https://nytimes.com/article-x": "failed" },
        paywallMap: {
          "https://nytimes.com/article-x": {
            paywalled: true,
            publisher: "nytimes.com",
            reason: "session-expired",
          },
        },
        viewMode: "extracted",
      });
    });

    expect(screen.getByText(/session needs refreshing/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Full text toggle enabled when status is 'failed' but a paywall verdict exists (NYT regression)", () => {
    // Background extraction on an NYT article hits the paywall and marks
    // status "failed" + records the verdict. Disabling the toggle would
    // trap the user with no way to surface the authorize prompt.
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);

    act(() => {
      useExtractionStore.setState({
        cache: {},
        statusMap: { "https://nytimes.com/article-x": "failed" },
        paywallMap: {
          "https://nytimes.com/article-x": {
            paywalled: true,
            publisher: "nytimes.com",
            reason: "nyt-cta",
          },
        },
        viewMode: "feed",
      });
    });

    const toggle = screen.getByRole("button", { name: /Full text/i });
    expect(toggle).not.toBeDisabled();
  });

  it("renders PaywallPrompt on mobile (onNavigate path) too", () => {
    mockIsDesktop = false;
    useExtensionStore.setState({
      status: "installed",
      authorizedDomains: [],
    });
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    // Mobile path supplies onNavigate / onBack so the reader pane wraps
    // the body in a scroll container + nav pills. The PaywallPrompt
    // lives inside that body, so it must render on the mobile branch
    // exactly as it does on desktop.
    render(<ReaderPanel onNavigate={vi.fn()} onBack={vi.fn()} />);

    act(() => {
      useExtractionStore.setState({
        cache: {},
        statusMap: { "https://nytimes.com/article-x": "failed" },
        paywallMap: {
          "https://nytimes.com/article-x": {
            paywalled: true,
            publisher: "nytimes.com",
            reason: "nyt-cta",
          },
        },
        viewMode: "extracted",
      });
    });

    const prompt = screen.getByRole("region", { name: /paywall prompt/i });
    expect(prompt).toBeInTheDocument();
    // Authorize button is reachable on mobile.
    expect(
      screen.getByRole("button", { name: /authorize/i }),
    ).toBeInTheDocument();
  });

  it("still disables the Full text toggle when status is 'failed' with NO paywall verdict (genuine extraction failure)", () => {
    useArticleStore.setState({
      selectedArticle: mockArticle(),
      articles: [],
      isLoading: false,
    });

    render(<ReaderPanel />);

    act(() => {
      useExtractionStore.setState({
        cache: {},
        statusMap: { "https://nytimes.com/article-x": "failed" },
        paywallMap: {},
        viewMode: "feed",
      });
    });

    const toggle = screen.getByRole("button", { name: /Full text/i });
    expect(toggle).toBeDisabled();
  });
});
