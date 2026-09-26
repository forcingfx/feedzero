import { useEffect, useRef, lazy, Suspense, type ReactNode, type PointerEvent } from "react";
import { useParams, useNavigate } from "react-router";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
  type Transition,
} from "motion/react";
import { shouldCommitSwipeBack } from "@/lib/swipe-back.ts";
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
 * Mobile: the list fills the viewport; the reader is an OVERLAY LAYER
 * on top of it whenever the URL carries an articleId. Tap goes in,
 * edge-swipe-right (or the back pill) goes out — the list never
 * horizontal-swipes into the reader and never unmounts, so its scroll
 * position survives reading. (Replaces the earlier snap-x pager,
 * which made the two panels feel physically connected and fought the
 * row swipe-actions — user feedback on PR #237.)
 *
 * Drives article selection from URL params and auto-selects the first
 * article on desktop.
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

  // Feed switch: select feed and start loading when feedId changes
  useEffect(() => {
    if (!feedId || feedId === loadedFeedRef.current) return;
    loadedFeedRef.current = feedId;
    lastSyncedArticleIdRef.current = undefined;
    selectFeed(feedId);
    selectArticle(null);
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
    navigate(`/feeds/${feedId}`, { replace: true });
  }, [isDesktop, feedId, articleId, articles, isLoadingArticles, navigate]);

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
    const closeReader = () => {
      skipAutoSelectRef.current = true;
      navigate(`/feeds/${feedId}`);
    };
    return (
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* The list fills the viewport and stays mounted while reading,
            so its scroll position survives the round trip. */}
        <main role="main" className="h-full">
          <ArticleList onArticleSelect={handleArticleSelect} />
        </main>

        {articleId && feedId && (
          <MobileReaderLayer onBack={closeReader}>
            <div data-testid="reader-scroll-mobile" className="h-full">
              <ReaderPanel
                nextArticle={nextArticle}
                prevArticle={prevArticle}
                onNavigate={handleArticleSelect}
                onBack={closeReader}
              />
            </div>
          </MobileReaderLayer>
        )}
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

/** iOS's navigation curve: fast start, long gentle settle. */
const IOS_EASE = [0.32, 0.72, 0, 1] as const;
const ENTER: Transition = { type: "tween", ease: IOS_EASE, duration: 0.3 };
const EXIT: Transition = { type: "tween", ease: IOS_EASE, duration: 0.22 };
const SNAP_BACK: Transition = { type: "spring", stiffness: 500, damping: 45 };
const INSTANT: Transition = { duration: 0 };

/**
 * Full-viewport layer hosting the mobile reader above the article list.
 * Slides in from the right on mount. A rightward drag anywhere on it
 * follows the finger (Motion drag); a flick or a drag past about a third
 * of the width slides it off screen and THEN calls `onBack`, so the
 * route change never cuts an animation short. An early release springs
 * back.
 *
 * Drags start by hand (`dragListener={false}`) for three reasons:
 * Motion's own listener sets `user-select: none`, which would make
 * article text uncopyable; `<pre>` blocks keep their native horizontal
 * pan; and only touch drags count, since in a narrow desktop window a
 * mouse drag is text selection. Not edge-gated: mobile browsers own the
 * screen edge for their own back gesture.
 */
function MobileReaderLayer({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // Pixels, never "100%": Motion cannot resolve a percentage offset
  // without a layout measurement, so a drag caught mid-entry would jump.
  const x = useMotionValue(reduceMotion ? 0 : window.innerWidth);
  const dragControls = useDragControls();
  const lockedAxis = useRef<"x" | "y" | null>(null);

  useEffect(() => {
    const entry = animate(x, 0, reduceMotion ? INSTANT : ENTER);
    return () => entry.stop();
  }, [x, reduceMotion]);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (event.target instanceof Element && event.target.closest("pre")) return;
    lockedAxis.current = null;
    dragControls.start(event);
  }

  function finishSwipe(_: unknown, info: PanInfo) {
    const width = layerRef.current?.clientWidth || window.innerWidth;
    // A drag Motion locked to the y axis is a scroll: the layer never
    // moved, and its stray horizontal speed must not count as a flick.
    const offsetX = lockedAxis.current === "x" ? info.offset.x : 0;
    const release = { offsetX, velocityX: info.velocity.x, width };
    if (shouldCommitSwipeBack(release)) {
      void animate(x, width, reduceMotion ? INSTANT : EXIT).then(onBack);
    } else {
      void animate(x, 0, reduceMotion ? INSTANT : SNAP_BACK);
    }
  }

  return (
    <motion.div
      ref={layerRef}
      data-testid="reader-layer"
      data-reader-layer
      className="absolute inset-0 z-20 bg-background will-change-transform"
      style={{ x }}
      drag="x"
      dragListener={false}
      dragControls={dragControls}
      dragDirectionLock
      onDirectionLock={(axis) => (lockedAxis.current = axis)}
      dragConstraints={{ left: 0 }}
      dragElastic={0}
      dragMomentum={false}
      onPointerDown={startSwipe}
      onDragEnd={finishSwipe}
    >
      {children}
    </motion.div>
  );
}
