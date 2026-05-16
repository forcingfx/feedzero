import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore, clearArticleCache } from "@/stores/article-store.ts";
import * as db from "@/core/storage/db.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "@/utils/constants.ts";
import type { Article, Feed } from "@/types/index.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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
let currentSearch = "";

/** Captures the current URL on each render. */
function LocationCapture() {
  const loc = useLocation();
  currentUrl = loc.pathname;
  currentSearch = loc.search;
  return null;
}

/** Test helper: a button that navigates to `to` when clicked. */
function NavigateButton({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button data-testid={`nav-to-${label}`} onClick={() => navigate(to)}>
      {label}
    </button>
  );
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
    // Default to "feeds already loaded" so the most common test path
    // (set feeds via setState then render) doesn't get blocked by the
    // explore-vs-all redirect gate. The dedicated gate test below sets
    // feedsLoaded:false explicitly.
    feedsLoaded: true,
  });
  useArticleStore.setState({
    articles: [],
    selectedArticle: null,
    isLoading: false,
  });
  clearArticleCache();
  vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [] });
}

describe("FeedsPage behavior — desktop", () => {
  beforeEach(() => {
    mockIsDesktop = true;
    currentUrl = "";
    resetStores();
  });

  it("shows explore catalog at /feeds when there are no feeds (redirects to /explore)", async () => {
    renderPage("/feeds");

    // Minimal-feed states (zero feeds, single feed) route to /explore on
    // both desktop and mobile so the user immediately sees a discoverable
    // catalog instead of an empty list.
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/explore");
    });
    expect(await screen.findByRole("heading", { name: "Explore" })).toBeInTheDocument();
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

  it("selects a folder-aggregated feed from the URL on mount", () => {
    const folderFeedId = toFolderFeedId("tech");
    useFeedStore.setState({
      feeds: [
        { ...makeFeed("feed-1"), folderId: "tech" },
        { ...makeFeed("feed-2"), folderId: "tech" },
      ],
    });

    renderPage(`/feeds/${folderFeedId}`);

    // Observable: folder feed is selected in store state
    expect(useFeedStore.getState().selectedFeedId).toBe(folderFeedId);
  });

  it("preserves the query string when auto-redirecting to /explore (deeplink survives)", async () => {
    // Production bug: landing on /feeds?subscribe=personal-monthly with 0 or 1
    // feeds triggered an auto-redirect to /explore that dropped the search
    // string. SubscribeDeeplink then ran at /explore with no ?subscribe= and
    // no Stripe Checkout fired. Search must survive both this redirect and
    // the catchall in app.tsx (covered by NavigateWithSearch tests).
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    renderPage("/feeds?subscribe=personal-monthly");

    await vi.waitFor(() => {
      expect(currentUrl).toBe("/explore");
    });
    expect(currentSearch).toBe("?subscribe=personal-monthly");
  });

  it("auto-navigates to /explore when only one feed exists (starter state)", async () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    renderPage("/feeds");

    // A single feed — typically just the auto-subscribed release feed —
    // counts as "still in starter mode": route to /explore so the user
    // can discover more to read, instead of landing in a one-feed All Items.
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/explore");
    });
  });

  it("auto-navigates to All items feed when multiple feeds exist", async () => {
    useFeedStore.setState({
      feeds: [makeFeed("feed-1"), makeFeed("feed-2")],
    });

    renderPage("/feeds");

    await vi.waitFor(() => {
      expect(currentUrl).toBe(`/feeds/${ALL_FEEDS_ID}`);
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

  describe("explore-as-home when feed count is minimal", () => {
    it("redirects /feeds to /explore when the user has zero feeds", async () => {
      useFeedStore.setState({ feeds: [], feedsLoaded: true });

      renderPage("/feeds");

      await vi.waitFor(() => {
        expect(currentUrl).toBe("/explore");
      });
    });

    it("redirects /feeds to /explore when the user has only one feed (e.g. the auto-subscribed release feed)", async () => {
      useFeedStore.setState({
        feeds: [makeFeed("release")],
        feedsLoaded: true,
      });

      renderPage("/feeds");

      await vi.waitFor(() => {
        expect(currentUrl).toBe("/explore");
      });
    });

    it("falls back to All items once the user has two or more feeds", async () => {
      useFeedStore.setState({
        feeds: [makeFeed("feed-1"), makeFeed("feed-2")],
        feedsLoaded: true,
      });

      renderPage("/feeds");

      await vi.waitFor(() => {
        expect(currentUrl).toBe(`/feeds/${ALL_FEEDS_ID}`);
      });
    });

    it("does not redirect until loadFeeds has completed (avoids the empty-store flash)", () => {
      // feedsLoaded=false models the brief window between FeedsPage mounting
      // and loadFeeds resolving. Without the gate, the effect would fire with
      // feeds=[] and route a returning multi-feed user to /explore.
      useFeedStore.setState({
        feeds: [makeFeed("feed-1"), makeFeed("feed-2")],
        feedsLoaded: false,
      });

      renderPage("/feeds");

      expect(currentUrl).toBe("/feeds");
    });
  });
});

describe("FeedsPage behavior — mobile", () => {
  beforeEach(() => {
    mockIsDesktop = false;
    currentUrl = "";
    resetStores();
  });

  it("redirects /feeds → /explore when feed count is minimal (mobile)", async () => {
    renderPage("/feeds");
    // Minimal-feed mobile users land on /explore (same robust contract as
    // desktop), where the catalog renders inline.
    await vi.waitFor(() => {
      expect(currentUrl).toBe("/explore");
    });
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

  it("redirects /feeds to /explore on mobile when feed count is minimal", async () => {
    // Empty + single-feed states land on /explore (mobile renders the explore
    // catalog inline) so a brand new user immediately sees discoverable feeds
    // instead of an empty list. Multi-feed users land on /feeds/all as before
    // — covered by the desktop suite above.
    renderPage("/feeds");

    await vi.waitFor(() => {
      expect(currentUrl).toBe("/explore");
    });
  });

  it("does NOT auto-navigate to first article when feed has articles (mobile)", async () => {
    const articles = [makeArticle("art-1"), makeArticle("art-2")];
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles });

    renderPage("/feeds/feed-1");

    // On mobile, tapping a feed should land on the article list, not the
    // first article. Wait long enough for any pending auto-nav to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(currentUrl).toBe("/feeds/feed-1");
  });

  it("back button is present in nav bar when viewing an article", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");

    const pill = container.querySelector("[data-testid='back-pill']");
    expect(pill).not.toBeNull();
    // Mobile back pill is icon-only — no "Back" label
    expect(pill!.textContent).not.toContain("Back");
  });

  it("pull-to-advance pull zone is not present in mobile reader (replaced by nav pills)", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles: [makeArticle("art-1")] });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");

    expect(container.querySelector("[data-testid='pull-zone-bottom']")).toBeNull();
  });

  it("nav pills are present in mobile reader when there is a next article", async () => {
    const a1 = makeArticle("art-1");
    const a2 = makeArticle("art-2");
    vi.mocked(db.getArticles).mockResolvedValueOnce({ ok: true, value: [a1, a2] });
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles: [a1, a2], selectedArticle: a1 });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");

    await waitFor(() => {
      expect(container.querySelector("[data-testid='next-pill']")).not.toBeNull();
    });
  });

  it("reader-scroll-mobile outer wrapper has no bottom padding (nav bar is in-flow, not floating)", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");

    const wrapper = container.querySelector("[data-testid='reader-scroll-mobile']");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).not.toMatch(/\bpb-(20|24|28|32)\b/);
  });

  it("back pill is not present on article list (no articleId in URL)", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    const { container } = renderPage("/feeds/feed-1");

    const pill = container.querySelector("[data-testid='back-pill']");
    expect(pill).toBeNull();
  });

  it("back pill is not present at /feeds root", () => {
    const { container } = renderPage("/feeds");

    const pill = container.querySelector("[data-testid='back-pill']");
    expect(pill).toBeNull();
  });

  it("resets reader scroll position to top when article changes (mobile)", async () => {
    const user = userEvent.setup();
    const a1 = makeArticle("art-1");
    const a2 = makeArticle("art-2");
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [a1, a2] });
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [a1, a2],
      selectedArticle: a1,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/feeds/feed-1/articles/art-1"]}>
        <NavigateButton to="/feeds/feed-1/articles/art-2" label="next" />
        <Routes>
          <Route
            path="/feeds/:feedId/articles/:articleId"
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

    // ReaderPanel owns the scroll container; wait for effects to settle first.
    let readerScroll!: HTMLElement;
    await waitFor(() => {
      readerScroll = container.querySelector(
        "[data-testid='reader-scroll-container']",
      ) as HTMLElement;
      expect(readerScroll).not.toBeNull();
    });

    readerScroll.scrollTop = 500;
    expect(readerScroll.scrollTop).toBe(500);

    await user.click(screen.getByTestId("nav-to-next"));

    await vi.waitFor(() => {
      const after = container.querySelector(
        "[data-testid='reader-scroll-container']",
      ) as HTMLElement;
      expect(after.scrollTop).toBe(0);
    });
  });

  it("does NOT scroll to reader on initial mobile load with articleId in URL", async () => {
    // When the URL contains an articleId on initial load (e.g. user resized from
    // desktop or opened a bookmarked article URL), the snap container must stay
    // at position 0 (article list). The scroll-to-reader effect must only fire
    // when the user explicitly selects an article — not on mount.
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({ articles: [makeArticle("art-1")] });

    // Spy on HTMLElement.prototype.scrollTo to capture scroll-left calls
    const snapScrollCalls: number[] = [];
    const origScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (optionsOrX?: ScrollToOptions | number) {
      const left = typeof optionsOrX === "number"
        ? optionsOrX
        : (optionsOrX as ScrollToOptions)?.left ?? 0;
      if ((this as HTMLElement).classList?.contains("snap-x")) {
        snapScrollCalls.push(left);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (origScrollTo as any).call(this, optionsOrX);
    };

    renderPage("/feeds/feed-1/articles/art-1");
    // Wait for any requestAnimationFrame callbacks to settle
    await new Promise((r) => setTimeout(r, 50));

    HTMLElement.prototype.scrollTo = origScrollTo;

    // scrollTo with left > 0 should NOT have been called on the snap container
    expect(snapScrollCalls.filter((l) => l > 0)).toHaveLength(0);
  });

  it("navigating to a different feed scrolls the snap container back to the article list", async () => {
    // If the user is on the reader panel (panel 2) and navigates to a different
    // feed, the snap container must scroll back to panel 1 (article list).
    // Without this, the reader shows empty state for the new feed.
    useFeedStore.setState({ feeds: [makeFeed("feed-1"), makeFeed("feed-2")] });
    useArticleStore.setState({ articles: [makeArticle("art-1")], selectedArticle: makeArticle("art-1") });

    const snapScrollToLeft: number[] = [];
    const origScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function (optionsOrX?: ScrollToOptions | number) {
      const left = typeof optionsOrX === "number"
        ? optionsOrX
        : (optionsOrX as ScrollToOptions)?.left ?? 0;
      if ((this as HTMLElement).classList?.contains("snap-x")) {
        snapScrollToLeft.push(left);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (origScrollTo as any).call(this, optionsOrX);
    };

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/feeds/feed-1/articles/art-1"]}>
        <NavigateButton to="/feeds/feed-2" label="go-feed-2" />
        <Routes>
          <Route path="/feeds/:feedId" element={<FeedsPage />} />
          <Route path="/feeds/:feedId/articles/:articleId" element={<FeedsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Simulate snap container being at panel 2
    const snapEl = container.querySelector(".snap-x") as HTMLElement;
    if (snapEl) Object.defineProperty(snapEl, "scrollLeft", { value: 400, writable: true });

    await user.click(screen.getByTestId("nav-to-go-feed-2"));

    HTMLElement.prototype.scrollTo = origScrollTo;

    await waitFor(() => {
      expect(snapScrollToLeft.filter((l) => l === 0)).toHaveLength(1);
    });
  });

  it("mobile header does not have a sidebar trigger (replaced by bottom drawer)", () => {
    const { container } = renderPage("/feeds");

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const trigger = header!.querySelector("[data-sidebar='trigger']");
    expect(trigger).toBeNull();
  });

  it("mobile nav drawer handle strip is present on mobile", () => {
    const { container } = renderPage("/feeds");
    expect(
      container.ownerDocument.querySelector("[data-testid='drawer-handle-strip']"),
    ).not.toBeNull();
  });

  it("mobile nav drawer is not rendered on desktop", () => {
    mockIsDesktop = true;
    const { container } = renderPage("/feeds");
    expect(
      container.ownerDocument.querySelector("[data-testid='drawer-handle-strip']"),
    ).toBeNull();
  });
});

describe("FeedsPage — explore route", () => {
  beforeEach(() => {
    currentUrl = "";
    resetStores();
  });

  it("shows explore catalog at /explore on desktop", async () => {
    mockIsDesktop = true;
    renderPage("/explore");

    expect(await screen.findByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.queryByText("No feeds yet")).not.toBeInTheDocument();
  });

  it("shows explore catalog at /explore on mobile", async () => {
    mockIsDesktop = false;
    renderPage("/explore");

    expect(await screen.findByRole("heading", { name: "Explore" })).toBeInTheDocument();
  });

  it("does not show article list or reader at /explore", async () => {
    // Desktop /explore shows sidebar + explore (2 panels), not 3-panel reader layout.
    mockIsDesktop = true;
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });

    const { container } = renderPage("/explore");

    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
    expect(await screen.findByRole("heading", { name: "Explore" })).toBeInTheDocument();
  });
});
