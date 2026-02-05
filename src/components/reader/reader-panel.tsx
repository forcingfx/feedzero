import { useEffect } from "react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import {
  getAvailableModes,
  hasSummarySubheading,
} from "@/lib/content-modes.ts";
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
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const cache = useExtractionStore((s) => s.cache);
  const viewMode = useExtractionStore((s) => s.viewMode);
  const isExtracting = useExtractionStore((s) => s.isExtracting);
  const setViewMode = useExtractionStore((s) => s.setViewMode);
  const switchToExtracted = useExtractionStore((s) => s.switchToExtracted);
  const resetForArticle = useExtractionStore((s) => s.resetForArticle);

  // Reset view mode when article changes
  useEffect(() => {
    resetForArticle();
  }, [article?.id, resetForArticle]);

  // Defensive: don't render article if it doesn't belong to current feed
  // (skip check for global view where articles from any feed are allowed)
  if (
    article &&
    selectedFeedId &&
    selectedFeedId !== ALL_FEEDS_ID &&
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
  const modes = getAvailableModes({
    content: article.content,
    summary: article.summary,
    link: article.link,
    cachedExtraction,
  });

  function handleModeChange(mode: ViewMode) {
    // "original" is handled by the link itself (opens in new tab)
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

  return (
    <article className="p-4 px-6">
      <h2 className="text-xl font-semibold mb-2">
        {decodeEntities(article.title)}
      </h2>

      <div className="text-sm text-muted-foreground mb-4">
        {article.author && <>{article.author} &bull; </>}
        {formatDate(article.publishedAt)}
      </div>

      <ViewToggle
        modes={modes}
        activeMode={viewMode}
        articleLink={article.link}
        onModeChange={handleModeChange}
      />

      {isExtracting ? (
        <p className="italic text-muted-foreground">Extracting full article…</p>
      ) : (
        <ArticleContent key={viewMode} html={getContent()} />
      )}
    </article>
  );
}
