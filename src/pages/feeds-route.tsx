import { useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { PANEL_LAYOUT_ID } from "@feedzero/core/utils/constants";
import { findNextArticle, findPrevArticle } from "@/lib/next-article.ts";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { StageView } from "@/pages/stage-view.tsx";

const ExploreCatalog = lazy(() =>
  import("@/components/explore/explore-catalog.tsx").then((m) => ({
    default: m.ExploreCatalog,
  })),
);

/**
 * The feeds surface: article list + reader pane.
 *
 * Desktop: inner ResizablePanelGroup [article-list | reader].
 * Mobile: horizontal scroll-snap container [list | reader].
 *
 * Drives article selection from URL params, auto-selects the first
 * article on desktop, and handles the mobile back-swipe gesture.
 *
 * When the user has no feeds, redirects to /explore — the empty state
 * for "feeds" is the catalog itself.
 */
export function FeedsRoute() {
  const { feedId, articleId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const feeds = useFeedStore((s) => s.feeds);
  const feedsLoaded = useFeedStore((s) => s.feedsLoaded);
  const selectFeed = useFeedStore((s) => s.selectFeed);
  const loadArticles = useArticleStore((s) => s.loadArticles);
  const articles = useArticleStore((s) => s.articles);
  const selectArticle = useArticleStore((s) => s.selectArticle);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const isLoadingArticles = useArticleStore((s) => s.isLoading);

  // Track whether user explicitly navigated back (to suppress auto-select)
  const skipAutoSelectRef = useRef(false);

  // Track which articleId the article-sync effect last applied. Used to
  // skip re-syncing when `articles` mutates for unrelated reasons
  // (mark-as-read flush inside selectArticle, refresh, sync push) while
  // React Router's useParams hasn't yet caught up to a recent navigate().
  // Without this guard, the effect would clobber the freshly set
  // selection with the article matching the previous URL.
  const lastSyncedArticleIdRef = useRef<string | undefined>(undefined);

  // Track which feedId we last triggered a load for, to avoid redundant
  // loads when the effect re-fires for the same param.
  const loadedFeedRef = useRef<string | null>(null);

  // Scroll-snap container ref (mobile only)
  const snapContainerRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);

  const scrollToReader = useCallback(() => {
    const el = snapContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
  }, []);

  const scrollToList = useCallback(() => {
    const el = snapContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    skipAutoSelectRef.current = true;
    el.scrollTo({ left: 0, behavior: "smooth" });
  }, []);

  // Feed switch: select feed and start loading when feedId changes
  useEffect(() => {
    if (!feedId || feedId === loadedFeedRef.current) return;
    loadedFeedRef.current = feedId;
    lastSyncedArticleIdRef.current = undefined;
    selectFeed(feedId);
    selectArticle(null);
    // On mobile, if the reader panel is visible (container scrolled right),
    // snap back to the article list so the user lands on panel 1 for the
    // new feed.
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
  }, [feedId, selectFeed, selectArticle, loadArticles, articleId, navigate, isDesktop, scrollToList]);

  // Article sync + auto-select. Waits until loading completes, then either
  // syncs articleId from URL or auto-selects the first article on desktop.
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

  // Mobile: when the article being read disappears from the loaded set (e.g.
  // the user clears the article cache), the reader stage goes empty. Send them
  // back to the article list rather than stranding them on a blank reader.
  //
  // Tracked as a present→absent transition so a deeplink to an already-empty
  // feed still shows the reader's own empty state instead of bouncing — the
  // bounce only fires for an article that *was* on screen and then vanished.
  const viewedArticlePresentRef = useRef(false);
  useEffect(() => {
    if (isDesktop || !feedId || !articleId || isLoadingArticles) return;
    if (articles.some((a) => a.id === articleId)) {
      viewedArticlePresentRef.current = true;
      return;
    }
    if (!viewedArticlePresentRef.current) return;
    viewedArticlePresentRef.current = false;
    skipAutoSelectRef.current = true;
    scrollToList();
    navigate(`/feeds/${feedId}`, { replace: true });
  }, [isDesktop, feedId, articleId, articles, isLoadingArticles, navigate, scrollToList]);

  // Scroll to the reader panel when the user explicitly navigates to an article.
  // snapScrollMountedRef skips the initial render so loading the app with an
  // articleId already in the URL lands on the article list, not the reader.
  // Depending only on articleId means a desktop→mobile viewport transition
  // never fires this scroll.
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
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      if (el!.scrollLeft < el!.clientWidth / 2 && articleId && feedId) {
        skipAutoSelectRef.current = true;
        navigate(`/feeds/${feedId}`, { replace: true });
      }
    }

    el.addEventListener("scrollend", handleScrollEnd);
    return () => el.removeEventListener("scrollend", handleScrollEnd);
  }, [isDesktop, articleId, feedId, navigate]);

  function handleArticleSelect(article: { id: string }) {
    if (!feedId) return;
    // Select article immediately for instant UI response, then sync URL
    const fullArticle = articles.find((a) => a.id === article.id);
    if (fullArticle) selectArticle(fullArticle);
    navigate(`/feeds/${feedId}/articles/${article.id}`);
  }

  const nextArticle = findNextArticle(articles, selectedArticle);
  const prevArticle = findPrevArticle(articles, selectedArticle);

  // Empty-feeds state: render the explore catalog inline. The URL stays
  // at /feeds/* so the header keeps its breadcrumb context. AppLayout's
  // useDefaultFeedsRedirect handles the *bare* /feeds → /explore hop;
  // here we cover /feeds/:feedId with no feeds in store (a stale URL
  // hit after the user deleted everything).
  if (feedsLoaded && feeds.length === 0) {
    return (
      <StageView>
        <Suspense>
          <ExploreCatalog onFeedAdded={(id) => navigate(`/feeds/${id}`)} />
        </Suspense>
      </StageView>
    );
  }

  if (!isDesktop) {
    return (
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
    );
  }

  return (
    <ResizablePanelGroup
      id={PANEL_LAYOUT_ID.STAGE_INNER}
      direction="horizontal"
      className="h-full"
    >
      <ResizablePanel
        id="article-list"
        defaultSize="40%"
        minSize="180px"
        className="overflow-hidden"
      >
        <ArticleList onArticleSelect={handleArticleSelect} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="reader"
        defaultSize="60%"
        minSize="200px"
        className="overflow-hidden"
      >
        <ReaderPanel
          nextArticle={nextArticle}
          prevArticle={prevArticle}
          onNavigate={handleArticleSelect}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
