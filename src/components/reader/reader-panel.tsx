import { useEffect } from "react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { isAggregatedFeedId } from "@/utils/constants.ts";
import { hasSummarySubheading } from "@/lib/content-modes.ts";
import { needsExtraction } from "@/core/extractor/extractor.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { ArticleContent } from "./article-content.tsx";
import { ViewToggle, type ViewMode } from "./view-toggle.tsx";

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

export function ReaderPanel() {
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

  // Reset view mode when article changes
  useEffect(() => {
    resetForArticle();
  }, [article?.id, resetForArticle]);

  // Auto-extract teaser articles in background
  useEffect(() => {
    if (article && needsExtraction(article)) {
      extractInBackground(article.link);
    }
  }, [article?.id, article?.link, extractInBackground]);

  // During loading, render nothing to prevent flash of empty state
  if (isLoading) return null;

  // Defensive: don't render article if it doesn't belong to current feed.
  // Aggregated views (global all-items, folder feeds) intentionally show
  // articles from many feeds — skip the mismatch check for them.
  if (
    article &&
    selectedFeedId &&
    !isAggregatedFeedId(selectedFeedId) &&
    article.feedId !== selectedFeedId
  ) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        Select an article to read.
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        Select an article to read.
      </div>
    );
  }

  const cachedExtraction = article.link ? cache[article.link] : undefined;
  const extractionStatus = article.link
    ? cachedExtraction
      ? "available" as const
      : statusMap[article.link] || "idle"
    : ("idle" as const);

  function handleModeChange(mode: ViewMode) {
    if (mode === "original") return;
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

  return (
    <article className="p-4 px-6">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight mb-2">
          {decodeEntities(article.title)}
        </h2>

        <div className="flex items-center gap-2 text-xs tracking-wide text-muted-foreground">
          {feed && (
            <>
              <FeedFavicon siteUrl={feed.siteUrl} className="size-3.5" />
              <span className="font-medium text-foreground/70">{feed.title}</span>
              <span>&bull;</span>
            </>
          )}
          {formatDate(article.publishedAt)}
        </div>
      </header>

      <ViewToggle
        activeMode={viewMode}
        articleLink={article.link}
        extractionStatus={extractionStatus}
        onModeChange={handleModeChange}
      />

      {viewMode === "extracted" && extractionStatus === "extracting" ? (
        <p className="italic text-muted-foreground">
          Extracting full article…
        </p>
      ) : (
        <ArticleContent html={getContent()} />
      )}
    </article>
  );
}
