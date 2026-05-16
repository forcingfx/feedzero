import { useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { useSharedSidebarSize } from "@/hooks/use-shared-sidebar-size.ts";
import { useSidebar } from "@/components/ui/sidebar.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { ALL_FEEDS_ID, PANEL_LAYOUT_ID } from "@/utils/constants.ts";
import { findNextArticle, findPrevArticle } from "@/lib/next-article.ts";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable.tsx";
import {
  SidebarProvider,
} from "@/components/ui/sidebar.tsx";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { HeaderBreadcrumbs } from "@/components/layout/header-breadcrumbs.tsx";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
const ExploreCatalog = lazy(() =>
  import("@/components/explore/explore-catalog.tsx").then((m) => ({
    default: m.ExploreCatalog,
  })),
);
const StatsPage = lazy(() =>
  import("@/components/stats/stats-page.tsx").then((m) => ({
    default: m.StatsPage,
  })),
);

/**
 * Listens for the feedzero:toggle-sidebar event and toggles the sidebar.
 * Must be rendered inside SidebarProvider.
 */
function SidebarKeyboardToggle() {
  const { toggleSidebar } = useSidebar();
  useEffect(() => {
    const handler = () => toggleSidebar();
    document.addEventListener("feedzero:toggle-sidebar", handler);
    return () =>
      document.removeEventListener("feedzero:toggle-sidebar", handler);
  }, [toggleSidebar]);
  return null;
}

/**
 * Main page component.
 * Desktop: sidebar (feeds) + article list + reader pane.
 * Mobile: sidebar collapses to offcanvas, single panel navigation.
 */
export function FeedsPage() {
  const { feedId, articleId } = useParams();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const isExplorePage = pathname === "/explore";
  const isStatsPage = pathname === "/stats";
  const isDesktop = useIsDesktop();
  useKeyboardNav();
  const feeds = useFeedStore((s) => s.feeds);
  const selectFeed = useFeedStore((s) => s.selectFeed);
  const loadArticles = useArticleStore((s) => s.loadArticles);
  const articles = useArticleStore((s) => s.articles);
  const selectArticle = useArticleStore((s) => s.selectArticle);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);

  // Navigate to /explore and focus search when N key or Plus button is used
  useEffect(() => {
    const handler = () => {
      navigate("/explore");
      setTimeout(() => {
        document.dispatchEvent(
          new CustomEvent("feedzero:focus-explore-search"),
        );
      }, 50);
    };
    document.addEventListener("feedzero:navigate-explore", handler);
    return () =>
      document.removeEventListener("feedzero:navigate-explore", handler);
  }, [navigate]);

  // U / I keyboard nav dispatches feedzero:navigate-feed with the next feed
  // id (built from feed-store state so closed-folder children are reachable).
  // Translate that into a URL push so feedId state propagates through React
  // Router and the sidebar's data-active state updates.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ feedId: string }>).detail.feedId;
      navigate(`/feeds/${id}`);
    };
    document.addEventListener("feedzero:navigate-feed", handler);
    return () => document.removeEventListener("feedzero:navigate-feed", handler);
  }, [navigate]);

  function handleFeedAdded(feedId: string) {
    handleFeedSelect(feedId);
  }

  // Track whether user explicitly navigated back (to suppress auto-select)
  const skipAutoSelectRef = useRef(false);

  // Track which articleId the line-136 effect last synced selectedArticle
  // from. Used to skip re-syncing when the effect re-fires for an unchanged
  // articleId — typically because `articles` mutated (mark-as-read flush
  // inside selectArticle, refresh, sync push) while React Router's
  // useParams articleId hasn't yet caught up to a recent navigate(). Without
  // this guard, the effect would clobber the freshly set selection with the
  // article matching the previous URL.
  const lastSyncedArticleIdRef = useRef<string | undefined>(undefined);

  // Default destination for a bare /feeds URL (no feedId). The decision is
  // driven by the actual feed count, not a persistent flag, so it is robust
  // across browser sessions, reset flows, and the timing race between the
  // first loadFeeds() and the release-feed auto-subscribe.
  //
  //   * 0 or 1 feeds  → /explore (still in starter mode; the one feed is
  //                     typically just the auto-subscribed release feed,
  //                     so we'd rather show the catalog than a one-feed
  //                     All Items list)
  //   * 2+ feeds      → /feeds/all (returning user — go to the aggregate)
  //
  // The `feedsLoaded` gate prevents a flash where the effect fires with
  // feeds=[] before loadFeeds() has populated the store. Without it, a
  // returning multi-feed user would land on /explore briefly and then get
  // stuck there once isExplorePage flipped true.
  const feedsLoaded = useFeedStore((s) => s.feedsLoaded);
  const feedCount = feeds.length;
  useEffect(() => {
    if (isExplorePage || isStatsPage) return;
    if (feedId) return;
    if (!feedsLoaded) return;
    if (feedCount <= 1) {
      navigate({ pathname: "/explore", search }, { replace: true });
      return;
    }
    navigate({ pathname: `/feeds/${ALL_FEEDS_ID}`, search }, { replace: true });
  }, [isExplorePage, isStatsPage, feedId, feedsLoaded, feedCount, navigate, search]);

  const isLoadingArticles = useArticleStore((s) => s.isLoading);

  // Track which feedId we last triggered a load for, to avoid redundant loads
  const loadedFeedRef = useRef<string | null>(null);

  // Feed switch: select feed and start loading when feedId changes
  useEffect(() => {
    if (!feedId || feedId === loadedFeedRef.current) return;
    loadedFeedRef.current = feedId;
    // Reset the URL-sync ref so the new feed's first article load is treated
    // as a fresh sync (the previous feed's articleId is no longer relevant).
    lastSyncedArticleIdRef.current = undefined;
    selectFeed(feedId);
    selectArticle(null);
    // On mobile, if the reader panel is visible (container scrolled right),
    // snap back to the article list so the user lands on panel 1 for the new feed.
    if (snapContainerRef.current?.scrollLeft) scrollToList();
    loadArticles(feedId).then(() => {
      // Only auto-select the first article on desktop, where the 3-panel
      // layout would otherwise show an empty reader pane. On mobile the
      // article list is a first-class destination — tapping a feed should
      // land there, not skip past it into the reader.
      if (!isDesktop) return;
      const { articles: loaded } = useArticleStore.getState();
      if (loaded.length > 0 && !articleId && !skipAutoSelectRef.current) {
        navigate(`/feeds/${feedId}/articles/${loaded[0].id}`, {
          replace: true,
        });
      }
    });
  }, [feedId, selectFeed, selectArticle, loadArticles, articleId, navigate, isDesktop]);

  // Article sync + auto-select (single effect replaces three cascading effects).
  // Waits until loading completes, then either syncs articleId from URL
  // or auto-selects the first article. No cascading navigations.
  //
  // The `articles` dep is required so the effect re-runs once the articles
  // list has loaded (initial mount with empty articles → articles populate
  // later → effect must fire to sync from URL). But it must NOT re-sync
  // from URL every time `articles` mutates for unrelated reasons (the
  // mark-as-read flush inside selectArticle, refresh, sync push). When
  // those mutations happen during a click, `articleId` from useParams may
  // still be the previously-selected article's id (React Router's state
  // hasn't caught up to a just-issued navigate) — re-syncing in that
  // window would clobber the click result with the previous article.
  // `lastSyncedArticleIdRef` gates the sync so it only runs when articleId
  // itself actually changed.
  useEffect(() => {
    if (!feedId || isLoadingArticles || articles.length === 0) return;

    if (articleId) {
      if (lastSyncedArticleIdRef.current === articleId) return;
      const article = articles.find((a) => a.id === articleId);
      if (article) {
        selectArticle(article);
        lastSyncedArticleIdRef.current = articleId;
      }
    } else if (isDesktop && !skipAutoSelectRef.current) {
      navigate(`/feeds/${feedId}/articles/${articles[0].id}`, {
        replace: true,
      });
    }
  }, [feedId, articleId, articles, isLoadingArticles, selectArticle, navigate, isDesktop]);

  // Reset skip flag when user navigates to an article
  useEffect(() => {
    if (articleId) {
      skipAutoSelectRef.current = false;
    }
  }, [articleId]);

  function handleFeedSelect(id: string) {
    navigate(`/feeds/${id}`);
  }

  function handleArticleSelect(article: { id: string }) {
    if (!feedId) return;
    // Select article immediately for instant UI response, then sync URL
    const fullArticle = articles.find((a) => a.id === article.id);
    if (fullArticle) selectArticle(fullArticle);
    navigate(`/feeds/${feedId}/articles/${article.id}`);
  }

  // Scroll-snap: programmatically scroll to the reader panel when an
  // article is selected, and back to the list when the back pill is tapped.
  const snapContainerRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);

  const nextArticle = findNextArticle(articles, selectedArticle);
  const prevArticle = findPrevArticle(articles, selectedArticle);

  /** Scroll the snap container to the reader (panel 2). */
  const scrollToReader = useCallback(() => {
    const el = snapContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
  }, []);

  /** Scroll the snap container back to the article list (panel 1). */
  const scrollToList = useCallback(() => {
    const el = snapContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    skipAutoSelectRef.current = true;
    el.scrollTo({ left: 0, behavior: "smooth" });
  }, []);

  // Scroll to the reader panel when the user explicitly navigates to an article.
  // mountedRef skips the initial render so loading the app with an articleId
  // already in the URL (e.g. after a desktop session or direct link) lands on
  // the article list, not the reader. Depending only on articleId means a
  // desktop→mobile viewport transition never fires this scroll.
  const snapScrollMountedRef = useRef(false);
  useEffect(() => {
    if (!snapScrollMountedRef.current) {
      snapScrollMountedRef.current = true;
      return;
    }
    if (!isDesktop && articleId && feedId) {
      requestAnimationFrame(() => scrollToReader());
    }
    // isDesktop intentionally excluded: viewport changes should not trigger scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // Detect user-initiated swipe-back via scrollend. When the user swipes
  // from the reader panel back to the list, drop the articleId from the URL
  // so the back navigation is reflected in history.
  useEffect(() => {
    const el = snapContainerRef.current;
    if (!el || isDesktop) return;

    function handleScrollEnd() {
      // Ignore scrolls we triggered programmatically.
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      // If scrolled back to the list panel and URL still has articleId, navigate.
      if (el!.scrollLeft < el!.clientWidth / 2 && articleId && feedId) {
        skipAutoSelectRef.current = true;
        navigate(`/feeds/${feedId}`, { replace: true });
      }
    }

    el.addEventListener("scrollend", handleScrollEnd);
    return () => el.removeEventListener("scrollend", handleScrollEnd);
  }, [isDesktop, articleId, feedId, navigate]);

  // Mobile: persistent bottom drawer for feed nav, two-panel scroll-snap for list ↔ reader
  if (!isDesktop) {
    // Explore page: no scroll-snap, single panel
    const showExplore = isExplorePage || (!feedId && feeds.length === 0 && !isStatsPage);

    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 z-10 bg-background">
          <HeaderBreadcrumbs fallback={feedId ? "Articles" : "Feeds"} />
        </header>

        {isStatsPage ? (
          <main role="main" className="flex-1 overflow-y-auto">
            <Suspense><StatsPage /></Suspense>
          </main>
        ) : showExplore ? (
          <main role="main" className="flex-1 overflow-y-auto">
            <Suspense><ExploreCatalog onFeedAdded={handleFeedAdded} /></Suspense>
          </main>
        ) : (
          <div
            ref={snapContainerRef}
            className="flex flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {/* Panel 1: Article list — owns its own scroll for virtualization */}
            <main role="main" className="shrink-0 w-full snap-start">
              <ArticleList onArticleSelect={handleArticleSelect} />
            </main>

            {/* Panel 2: Reader — ReaderPanel owns its own scroll and nav bar */}
            <div
              data-testid="reader-scroll-mobile"
              className="shrink-0 w-full snap-start h-full"
            >
              <ReaderPanel
                nextArticle={nextArticle}
                prevArticle={prevArticle}
                onNavigate={handleArticleSelect}
                onBack={articleId ? () => {
                  scrollToList();
                  navigate(`/feeds/${feedId}`);
                } : undefined}
              />
            </div>
          </div>
        )}

        <MobileNavDrawer onFeedSelect={handleFeedSelect} />
      </div>
    );
  }

  // Desktop: all three columns in one ResizablePanelGroup so sidebar, article
  // list, and reader are all independently user-resizable.
  // AppSidebar uses collapsible="none" so it renders inline (not fixed-position)
  // and participates naturally in the panel layout.
  const exploreOrEmpty = isExplorePage || feeds.length === 0;
  const showStats = isStatsPage;
  // Distinct group ids per layout shape: react-resizable-panels persists
  // panel widths under this id, so the 3-panel feeds layout and the 2-panel
  // explore/stats layout must not share an id (otherwise switching layouts
  // visibly rebalances the sidebar — see GitLab #13a).
  const layoutId =
    showStats || exploreOrEmpty ? PANEL_LAYOUT_ID.SINGLE : PANEL_LAYOUT_ID.FEEDS;
  const sidebarSize = useSharedSidebarSize(layoutId);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <SidebarKeyboardToggle />
      <ResizablePanelGroup id={layoutId} direction="horizontal" className="h-svh">
        <ResizablePanel
          id="sidebar"
          defaultSize={sidebarSize.defaultSize ?? "17%"}
          minSize="150px"
          maxSize="280px"
          className="overflow-hidden"
          panelRef={sidebarSize.panelRef}
          onResize={sidebarSize.onResize}
        >
          <AppSidebar
            collapsible="none"
            className="w-full h-full"
            onFeedSelect={handleFeedSelect}
          />
        </ResizablePanel>
        <ResizableHandle />
        {showStats ? (
          <ResizablePanel id="stats" className="overflow-hidden">
            <ScrollArea className="h-full">
              <Suspense><StatsPage /></Suspense>
            </ScrollArea>
          </ResizablePanel>
        ) : exploreOrEmpty ? (
          <ResizablePanel id="explore" className="overflow-hidden">
            <ScrollArea className="h-full">
              <Suspense><ExploreCatalog onFeedAdded={handleFeedAdded} /></Suspense>
            </ScrollArea>
          </ResizablePanel>
        ) : (
          <>
            <ResizablePanel
              id="article-list"
              defaultSize="33%"
              minSize="180px"
              className="overflow-hidden"
            >
              <ArticleList onArticleSelect={handleArticleSelect} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              id="reader"
              defaultSize="50%"
              minSize="200px"
              className="overflow-hidden"
            >
              <ReaderPanel
                nextArticle={nextArticle}
                prevArticle={prevArticle}
                onNavigate={handleArticleSelect}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
