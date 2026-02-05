import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import {
  getAvailableModes,
  hasSummarySubheading,
} from "@/lib/content-modes.ts";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { ArticleContent } from "./article-content.tsx";
import { ViewToggle } from "./view-toggle.tsx";

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
  if (article && selectedFeedId && article.feedId !== selectedFeedId) {
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

  function handleModeChange(mode: "feed" | "extracted") {
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

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span>
          {article.author && <>{article.author} &bull; </>}
          {formatDate(article.publishedAt)}
        </span>
        {article.link && (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-7 gap-1 text-xs"
          >
            <a href={article.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3" />
              Original
              <Kbd className="ml-1">O</Kbd>
            </a>
          </Button>
        )}
      </div>

      <ViewToggle
        modes={modes}
        activeMode={viewMode}
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
