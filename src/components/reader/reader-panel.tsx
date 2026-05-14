import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { isAggregatedFeedId } from "@/utils/constants.ts";
import { hasSummarySubheading } from "@/lib/content-modes.ts";
import { needsExtraction } from "@/core/extractor/extractor.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import type { Article } from "@/types/index.ts";
import { Kbd } from "@/components/ui/kbd.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { ArticleContent } from "./article-content.tsx";
import { cn } from "@/lib/utils.ts";

type ViewMode = "feed" | "extracted";

function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ReaderPanelProps {
  nextArticle?: Article | null;
  prevArticle?: Article | null;
  onNavigate?: (article: Article) => void;
  onBack?: () => void;
}

export function ReaderPanel({ nextArticle, prevArticle, onNavigate, onBack }: ReaderPanelProps = {}) {
  const isDesktop = useIsDesktop();
  const article = useArticleStore((s) => s.selectedArticle);
  const isLoading = useArticleStore((s) => s.isLoading);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const cache = useExtractionStore((s) => s.cache);
  const viewMode = useExtractionStore((s) => s.viewMode);
  const setViewMode = useExtractionStore((s) => s.setViewMode);
  const switchToExtracted = useExtractionStore((s) => s.switchToExtracted);
  const extractInBackground = useExtractionStore((s) => s.extractInBackground);
  const resetForArticle = useExtractionStore((s) => s.resetForArticle);
  const statusMap = useExtractionStore((s) => s.statusMap);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll and view mode when article changes.
  //
  // useLayoutEffect (not useEffect) is required: the scroll reset must run
  // synchronously after the DOM mutation but BEFORE the browser paints the
  // new article. With useEffect the user briefly sees article B at the
  // previous (article A) scroll offset before the position snaps back to 0.
  // See GitLab #8.
  useLayoutEffect(() => {
    resetForArticle();
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [article?.id, resetForArticle]);

  // Auto-extract teaser articles in background
  useEffect(() => {
    if (article && needsExtraction(article)) {
      extractInBackground(article.link);
    }
  }, [article?.id, article?.link, extractInBackground]);

  const emptyState = (
    <div className="p-4 text-muted-foreground text-sm">
      Select an article to read.
    </div>
  );

  // Navigation pills (back / prev / next) are mobile-only. Desktop keeps
  // the article list panel always visible plus j/k keyboard shortcuts —
  // the pills would just clutter the reader. On mobile the reader takes
  // the full screen, so the pills are the primary nav affordance.
  const navPills =
    !isDesktop && onNavigate && (prevArticle || nextArticle || onBack) ? (
      <div
        data-testid="nav-pills-bar"
        className="flex items-center gap-2 px-4 pb-4 pt-2 shrink-0"
      >
        {onBack && (
          <Button
            data-testid="back-pill"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full h-8 px-3 gap-1 bg-background/95 backdrop-blur-sm shadow-md"
            onClick={onBack}
          >
            <ChevronLeft className="size-3.5 shrink-0" />
          </Button>
        )}
        {prevArticle && (
          <Button
            data-testid="prev-pill"
            variant="outline"
            size="sm"
            className="flex-1 min-w-0 flex items-center gap-1 justify-start rounded-full shadow-md bg-background/95 backdrop-blur-sm"
            onClick={() => onNavigate(prevArticle)}
          >
            <ChevronLeft className="size-3.5 shrink-0" />
            <span className="truncate">{decodeEntities(prevArticle.title)}</span>
          </Button>
        )}
        {nextArticle && (
          <Button
            data-testid="next-pill"
            variant="outline"
            size="sm"
            className="flex-1 min-w-0 flex items-center gap-1 justify-end rounded-full shadow-md bg-background/95 backdrop-blur-sm"
            onClick={() => onNavigate(nextArticle)}
          >
            <span className="truncate">{decodeEntities(nextArticle.title)}</span>
            <ChevronRight className="size-3.5 shrink-0" />
          </Button>
        )}
      </div>
    ) : null;

  // Wraps empty/loading states in the flex column so layout is stable and the
  // nav bar (including back button) is always visible when onNavigate is provided.
  // The scroll container shares its ref + testid with the loaded-article path
  // so the scroll-reset effect always targets a stable element across state
  // transitions (loading → article).
  function wrap(content: ReactNode) {
    if (onNavigate) {
      return (
        <div className="h-full flex flex-col">
          <div
            ref={scrollContainerRef}
            data-testid="reader-scroll-container"
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none"
          >
            {content}
          </div>
          {navPills}
        </div>
      );
    }
    return <>{content}</>;
  }

  if (isLoading) return wrap(null);

  if (
    article &&
    selectedFeedId &&
    !isAggregatedFeedId(selectedFeedId) &&
    article.feedId !== selectedFeedId
  ) {
    return wrap(emptyState);
  }

  if (!article) {
    return wrap(emptyState);
  }

  const cachedExtraction = article.link ? cache[article.link] : undefined;
  const extractionStatus = article.link
    ? cachedExtraction
      ? "available" as const
      : statusMap[article.link] || "idle"
    : ("idle" as const);

  const extractedDisabled =
    extractionStatus === "extracting" || extractionStatus === "failed";

  function handleModeChange(mode: ViewMode) {
    if (mode === "extracted") {
      switchToExtracted(article?.link);
    } else {
      setViewMode("feed");
    }
  }

  function getContent(): string {
    if (viewMode === "extracted" && cachedExtraction) {
      return cachedExtraction;
    }

    const content = article!.content || article!.summary || "";
    const showSubheading = hasSummarySubheading(
      article!.content,
      article!.summary,
    );

    if (showSubheading) {
      return `<div class="italic border-l-3 border-border pl-2 mb-4 text-muted-foreground">${article!.summary}</div>${content}`;
    }
    return content;
  }

  const feed = feeds.find((f) => f.id === article.feedId);

  const articleBody = (
    <div data-testid="article-content-area" className="overflow-x-hidden">
      <article className="p-4 px-6">
        <header className="mb-3">
          <h2 className="text-2xl font-semibold tracking-tight mb-2 break-words">
            {article.link ? (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {decodeEntities(article.title)}
              </a>
            ) : (
              decodeEntities(article.title)
            )}
          </h2>

          <div
            data-testid="article-meta-line"
            className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs tracking-wide text-muted-foreground"
          >
            {feed && (
              <>
                <FeedFavicon siteUrl={feed.siteUrl} className="size-3.5" />
                <span className="font-medium text-foreground/70">{feed.title}</span>
                <span>&bull;</span>
              </>
            )}
            {formatDate(article.publishedAt)}
            {article.link && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    data-testid="open-original-hint"
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Open original <Kbd className="ml-1">o</Kbd>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Compact pill segmented control — own line, no ToggleGroup ARIA role */}
        <div className="flex items-center mb-3">
          <div className="flex rounded-full border border-border text-xs overflow-hidden">
            <button
              onClick={() => handleModeChange("feed")}
              className={cn(
                "px-3 py-1 transition-colors",
                viewMode === "feed"
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Feed
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  disabled={extractedDisabled}
                  onClick={() => handleModeChange("extracted")}
                  title={
                    extractionStatus === "failed"
                      ? "Extraction didn't find additional content"
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    viewMode === "extracted"
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {extractionStatus === "extracting" && (
                    <Loader2 className="size-2.5 animate-spin" />
                  )}
                  Full text
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Full text <Kbd className="ml-1">h</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {viewMode === "extracted" && extractionStatus === "extracting" ? (
          <p className="italic text-muted-foreground">
            Extracting full article…
          </p>
        ) : (
          <ArticleContent html={getContent()} />
        )}
      </article>
    </div>
  );

  if (onNavigate) {
    return (
      <div className="h-full flex flex-col">
        <div ref={scrollContainerRef} data-testid="reader-scroll-container" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none">
          {articleBody}
        </div>
        {navPills}
      </div>
    );
  }

  return <>{articleBody}</>;
}
