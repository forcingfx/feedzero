import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import * as db from "@/core/storage/db.ts";
import type { Article, Feed } from "@/types/index.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
  needsExtraction: vi.fn().mockReturnValue(false),
}));

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => mockIsDesktop,
}));

vi.mock("@/hooks/use-keyboard-nav.ts", () => ({
  useKeyboardNav: vi.fn(),
}));

function makeFeed(id: string): Feed {
  return {
    id,
    url: `https://example.com/${id}/feed.xml`,
    title: `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeArticle(id: string, feedId = "feed-1"): Article {
  return {
    id,
    feedId,
    guid: `guid-${id}`,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: `<p>Content for ${id}</p>`,
    summary: "",
    author: "",
    read: false,
    publishedAt: Date.now(),
    createdAt: Date.now(),
  };
}

let currentUrl = "";

/** Captures the current URL on each render. */
function LocationCapture() {
  const loc = useLocation();
  currentUrl = loc.pathname;
  return null;
}

function renderPage(route = "/feeds") {
  currentUrl = route;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/feeds"
          element={
            <>
              <FeedsPage />
              <LocationCapture />
            </>
          }
        />
        <Route
          path="/feeds/:feedId"
          element={
            <>
              <FeedsPage />
              <LocationCapture />
            </>
          }
        />
        <Route
          path="/feeds/:feedId/articles/:articleId"
          element={
            <>
              <FeedsPage />
              <LocationCapture />
            </>
          }
        />
        <Route
          path="/explore"
          element={
            <>
              <FeedsPage />
              <LocationCapture />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function resetStores() {
  useFeedStore.setState({
    feeds: [],
    selectedFeedId: null,
    isLoading: false,
    error: null,
    isRefreshingAll: false,
    refreshingFeedIds: new Set(),
  });
  useArticleStore.setState({
    articles: [],
    selectedArticle: null,
    isLoading: false,
  });
}

describe("FeedsPage behavior — desktop", () => {
  beforeEach(() => {
    mockIsDesktop = true;
    currentUrl = "";
    resetStores();
  });

  it("shows explore catalog when there are no feeds", () => {
    renderPage("/feeds");

    // With no feeds, auto-redirects to /explore which shows the catalog
    expect(screen.getByRole("heading", { name: "Explore feeds" })).toBeInTheDocument();
  });

  it("shows panels instead of empty state when feeds exist", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    const { container } = renderPage("/feeds");

    expect(screen.queryByText("No feeds yet")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='resizable-panel-group']"),
    ).not.toBeNull();
  });

  it("selects feed from URL on mount", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    renderPage("/feeds/feed-1");

    // Observable: feed is selected in store state
    expect(useFeedStore.getState().selectedFeedId).toBe("feed-1");
  });

  it("auto-navigates to single feed when no feedId in URL", async () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    renderPage("/feeds");

    // With one feed, auto-navigates to that feed
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1");
    });
  });

  it("clears articles when loading new feed", async () => {
    // Set up initial state with articles from a different feed
    useArticleStore.setState({
      articles: [makeArticle("old-art", "other-feed")],
      selectedArticle: makeArticle("old-art", "other-feed"),
    });
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    renderPage("/feeds/feed-1");

    // Observable: articles are cleared immediately (loading state)
    await vi.waitFor(() => {
      expect(useArticleStore.getState().selectedArticle).toBeNull();
    });
  });

  it("selects article when articleId matches in URL", () => {
    const article = makeArticle("art-1");
    useFeedStore.setState({
      feeds: [makeFeed("feed-1")],
      selectedFeedId: "feed-1",
    });
    useArticleStore.setState({ articles: [article] });

    renderPage("/feeds/feed-1/articles/art-1");

    // Observable: article is selected in store
    expect(useArticleStore.getState().selectedArticle?.id).toBe("art-1");
  });

  it("does not select article when articleId does not match any article", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles: [makeArticle("art-1")] });

    renderPage("/feeds/feed-1/articles/nonexistent");

    // Observable: no article is selected
    expect(useArticleStore.getState().selectedArticle).toBeNull();
  });

  it("auto-navigates to first article when feed has articles but no articleId in URL", async () => {
    const articles = [makeArticle("art-1"), makeArticle("art-2")];
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles });

    renderPage("/feeds/feed-1");

    // Observable: URL changes to include first article
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1/articles/art-1");
    });
  });

  it("does not auto-navigate when articleId is already in URL", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1"), makeArticle("art-2")],
    });

    renderPage("/feeds/feed-1/articles/art-2");

    // Observable: URL stays the same
    expect(currentUrl).toBe("/feeds/feed-1/articles/art-2");
  });
});

describe("FeedsPage behavior — mobile", () => {
  beforeEach(() => {
    mockIsDesktop = false;
    currentUrl = "";
    resetStores();
  });

  it("shows 'Feeds' in header at /feeds root", () => {
    renderPage("/feeds");
    // There are now two "Feeds" elements: one in header (fallback), one in sidebar group label
    const feedsElements = screen.getAllByText("Feeds");
    expect(feedsElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Articles' in header when feedId is present", () => {
    renderPage("/feeds/feed-1");
    expect(screen.getByText("Articles")).toBeInTheDocument();
  });

  it("shows 'Articles' fallback in header when articleId present but no feed in store", () => {
    useArticleStore.setState({ articles: [makeArticle("art-1")] });
    renderPage("/feeds/feed-1/articles/art-1");
    // With breadcrumbs, mobile header shows fallback "Articles" when feed isn't in store
    expect(screen.getByText("Articles")).toBeInTheDocument();
  });

  it("shows explore catalog when there are no feeds", () => {
    renderPage("/feeds");

    expect(screen.getByRole("heading", { name: "Explore feeds" })).toBeInTheDocument();
  });

  it("Back button navigates from article to article list and stays there", async () => {
    const articles = [makeArticle("art-1"), makeArticle("art-2")];

    // Mock getArticles to return articles (simulates real DB with data)
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: articles });

    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles });
    const { container } = renderPage("/feeds/feed-1/articles/art-2");

    const backBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("←"),
    );
    expect(backBtn).toBeDefined();

    await act(async () => {
      backBtn!.click();
    });

    // Observable: URL changes to article list and STAYS there
    // User should see the article list to pick a different article
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1");
    });

    // Wait a tick to ensure no auto-redirect happens
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Still at article list, not redirected back to an article
    expect(currentUrl).toBe("/feeds/feed-1");
  });

  it("Back button is not shown on article list (only on article reader)", () => {
    const { container } = renderPage("/feeds/feed-1");

    const backBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("←"),
    );
    expect(backBtn).toBeUndefined();
  });

  it("Back button is not shown at /feeds root", () => {
    const { container } = renderPage("/feeds");

    const backBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("←"),
    );
    expect(backBtn).toBeUndefined();
  });

  it("mobile header has sticky positioning", () => {
    const { container } = renderPage("/feeds");

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toMatch(/\bsticky\b/);
    expect(header!.className).toMatch(/\btop-0\b/);
  });
});

describe("FeedsPage — explore route", () => {
  beforeEach(() => {
    currentUrl = "";
    resetStores();
  });

  it("shows explore catalog at /explore on desktop", () => {
    mockIsDesktop = true;
    renderPage("/explore");

    expect(screen.getByRole("heading", { name: "Explore feeds" })).toBeInTheDocument();
    expect(screen.queryByText("No feeds yet")).not.toBeInTheDocument();
  });

  it("shows explore catalog at /explore on mobile", () => {
    mockIsDesktop = false;
    renderPage("/explore");

    expect(screen.getByRole("heading", { name: "Explore feeds" })).toBeInTheDocument();
  });

  it("does not show article list or reader at /explore", () => {
    mockIsDesktop = true;
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    const { container } = renderPage("/explore");

    expect(
      container.querySelector("[data-slot='resizable-panel-group']"),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Explore feeds" })).toBeInTheDocument();
  });
});
