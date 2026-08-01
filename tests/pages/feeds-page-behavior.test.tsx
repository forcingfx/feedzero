import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router";
import { lazy, Suspense } from "react";
import { AppLayout } from "@/pages/app-layout.tsx";
import { FeedsRoute } from "@/pages/feeds-route.tsx";
import { StageView } from "@/pages/stage-view.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore, clearArticleCache } from "@/stores/article-store.ts";
import * as db from "@/core/storage/db.ts";
import { ALL_FEEDS_ID, toFolderFeedId } from "@feedzero/core/utils/constants";
import type { Article, Feed } from "@feedzero/core/types";

const ExploreCatalog = lazy(() =>
  import("@/components/explore/explore-catalog.tsx").then((m) => ({
    default: m.ExploreCatalog,
  })),
);

function ExploreRoute() {
  const navigate = useNavigate();
  return (
    <StageView>
      <Suspense>
        <ExploreCatalog onFeedAdded={(id) => navigate(`/feeds/${id}`)} />
      </Suspense>
    </StageView>
  );
}

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
          element={
            <>
              <AppLayout />
              <LocationCapture />
            </>
          }
        >
          <Route path="/feeds" element={<FeedsRoute />} />
          <Route path="/feeds/:feedId" element={<FeedsRoute />} />
          <Route
            path="/feeds/:feedId/articles/:articleId"
            element={<FeedsRoute />}
          />
          <Route path="/explore" element={<ExploreRoute />} />
        </Route>
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

  it("navigates back to the article list when the viewed article's stage goes empty (mobile)", async () => {
    // The user is reading an article when its cache is cleared (e.g. "delete
    // all articles from cache"). The reader stage goes empty — on mobile the
    // user should land back on the article list, not a blank reader.
    const article = makeArticle("art-1", "feed-1");
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [article] });
    useFeedStore.setState({
      feeds: [makeFeed("feed-1")],
      selectedFeedId: "feed-1",
    });

    renderPage("/feeds/feed-1/articles/art-1");

    // Start on the reader with the article selected.
    await vi.waitFor(() => {
      expect(useArticleStore.getState().selectedArticle?.id).toBe("art-1");
    });

    // Clearing the cache empties the stage.
    act(() => {
      clearArticleCache();
    });

    await vi.waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1");
    });
  });

  it("stays on a deeplinked article URL when the feed simply loads empty (no bounce)", async () => {
    // A deeplink to a feed that fetches no articles must NOT bounce — there
    // was never an article to leave. Only a present→absent transition (cache
    // cleared mid-read) sends the user back. Guards the empty-feed deeplink.
    useFeedStore.setState({
      feeds: [makeFeed("feed-1")],
      selectedFeedId: "feed-1",
    });

    renderPage("/feeds/feed-1/articles/art-1");

    await new Promise((r) => setTimeout(r, 30));
    expect(currentUrl).toBe("/feeds/feed-1/articles/art-1");
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
            element={
              <>
                <AppLayout />
                <LocationCapture />
              </>
            }
          >
            <Route
              path="/feeds/:feedId/articles/:articleId"
              element={<FeedsRoute />}
            />
          </Route>
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

  // ── Reader-as-overlay model ─────────────────────────────────────────
  // The mobile reader is a LAYER over the article list, not a sibling
  // snap-pager panel. The old snap-x model made the list feel physically
  // connected to the reader — swiping left on the list dragged the reader
  // in, which fought row swipe-actions and misread the mental model
  // (user feedback on PR #237): tap goes IN, swipe goes OUT, and the
  // list underneath never moves or unmounts.

  it("mobile: reader renders as an overlay only when an article is open; the list stays mounted beneath", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });

    const closed = renderPage("/feeds/feed-1");
    expect(closed.container.querySelector("[data-testid='reader-layer']")).toBeNull();
    closed.unmount();

    const open = renderPage("/feeds/feed-1/articles/art-1");
    expect(open.container.querySelector("[data-testid='reader-layer']")).not.toBeNull();
    // The list is still in the DOM underneath — scroll position survives.
    expect(open.container.querySelector("[role='main']")).not.toBeNull();
  });

  it("mobile: the horizontal snap pager is gone — the list cannot swipe into the reader", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    const { container } = renderPage("/feeds/feed-1");
    expect(container.querySelector(".snap-x")).toBeNull();
  });

  it("mobile: a deeplink with articleId shows the reader overlay immediately", () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");
    expect(container.querySelector("[data-testid='reader-layer']")).not.toBeNull();
  });

  it("mobile: navigating to a different feed closes the reader overlay", async () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1"), makeFeed("feed-2")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });

    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/feeds/feed-1/articles/art-1"]}>
        <NavigateButton to="/feeds/feed-2" label="go-feed-2" />
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/feeds/:feedId" element={<FeedsRoute />} />
            <Route path="/feeds/:feedId/articles/:articleId" element={<FeedsRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(container.querySelector("[data-testid='reader-layer']")).not.toBeNull();

    await user.click(screen.getByTestId("nav-to-go-feed-2"));

    await waitFor(() => {
      expect(container.querySelector("[data-testid='reader-layer']")).toBeNull();
    });
  });

  it("mobile: edge-swipe right dismisses the reader back to the list", async () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    // Keep the article present through loadArticles, otherwise the
    // vanished-article guard navigates back on its own and this test
    // would pass without the gesture doing anything.
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [makeArticle("art-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");
    const layer = container.querySelector(
      "[data-testid='reader-layer']",
    ) as HTMLElement;

    const touch = (type: string, x: number) =>
      act(() => {
        layer.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [new Touch({ identifier: 1, target: layer, clientX: x, clientY: 300 })],
          }),
        );
      });

    touch("touchstart", 8); // within the left edge zone
    touch("touchmove", 80);
    touch("touchmove", 180);
    touch("touchend", 180);

    await waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1");
    });
  });

  it("mobile: a rightward drag anywhere on the reader dismisses it (browsers own the edge)", async () => {
    // Real mobile browsers run their OWN back gesture in the left edge
    // zone, so an edge-only dismiss is unreachable on device. Any
    // rightward-dominant drag on the reader goes back (Reeder model).
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [makeArticle("art-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");
    const layer = container.querySelector(
      "[data-testid='reader-layer']",
    ) as HTMLElement;

    const touch = (type: string, x: number, y = 300) =>
      act(() => {
        layer.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [new Touch({ identifier: 1, target: layer, clientX: x, clientY: y })],
          }),
        );
      });

    touch("touchstart", 180); // mid-screen
    touch("touchmove", 260);
    touch("touchmove", 340);
    touch("touchend", 340);

    await waitFor(() => {
      expect(currentUrl).toBe("/feeds/feed-1");
    });
  });

  it("mobile: a vertical-dominant drag does not dismiss the reader", async () => {
    useFeedStore.setState({ feeds: [makeFeed("feed-1")] });
    vi.mocked(db.getArticles).mockResolvedValue({ ok: true, value: [makeArticle("art-1")] });
    useArticleStore.setState({
      articles: [makeArticle("art-1")],
      selectedArticle: makeArticle("art-1"),
    });
    const { container } = renderPage("/feeds/feed-1/articles/art-1");
    const layer = container.querySelector(
      "[data-testid='reader-layer']",
    ) as HTMLElement;

    const touch = (type: string, x: number) =>
      act(() => {
        layer.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === "touchend"
                ? []
                : [new Touch({ identifier: 1, target: layer, clientX: x, clientY: 300 })],
          }),
        );
      });

    touch("touchstart", 150);
    act(() => {
      layer.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 1, target: layer, clientX: 190, clientY: 460 })],
        }),
      );
    });
    touch("touchend", 190);

    await new Promise((r) => setTimeout(r, 30));
    expect(currentUrl).toBe("/feeds/feed-1/articles/art-1");
  });

  it("mobile header: dot-only status indicator, view options pinned to the right corner", () => {
    // "Refreshed X ago · local" moved into the drawer footer; the header
    // keeps a compact color dot and puts the single view-options control
    // in the right corner (user feedback on PR #237).
    useFeedStore.setState({
      feeds: [makeFeed("feed-1")],
      lastRefreshAllAt: Date.now() - 5 * 60 * 1000,
    });
    const { container } = renderPage("/feeds/feed-1");
    const header = container.querySelector("header")!;

    expect(header.textContent).not.toMatch(/refreshed/i);
    expect(
      header.querySelector("[data-testid='sync-status-badge']"),
    ).not.toBeNull();
    const pills = header.querySelector("[data-testid='mobile-header-pills']");
    expect(pills).not.toBeNull();
    expect(header.lastElementChild).toBe(pills);
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
