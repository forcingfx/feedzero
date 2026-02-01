import { useEffect } from "react";
import { useArticleStore } from "@/stores/article-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import {
  getAvailableModes,
  hasSummarySubheading,
} from "@/lib/content-modes.ts";
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
  const cache = useExtractionStore((s) => s.cache);
  const viewMode = useExtractionStore((s) => s.viewMode);
  const isExtracting = useExtractionStore((s) => s.isExtracting);
  const setViewMode = useExtractionStore((s) => s.setViewMode);
  const fetchExtracted = useExtractionStore((s) => s.fetchExtracted);
  const resetForArticle = useExtractionStore((s) => s.resetForArticle);

  // Reset view mode when article changes
  useEffect(() => {
    resetForArticle();
  }, [article?.id, resetForArticle]);

  if (!article) {
    return (
      <div className="p-md text-muted-foreground text-sm">
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
    setViewMode(mode);
    if (mode === "extracted" && article?.link && !cache[article.link]) {
      fetchExtracted(article.link);
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
      return `<div class="italic border-l-3 border-border pl-sm mb-md text-muted-foreground">${article!.summary}</div>${content}`;
    }
    return content;
  }

  return (
    <article className="p-md px-lg">
      <h2 className="text-2xl font-semibold mb-sm">{article.title}</h2>

      <div className="text-sm text-muted-foreground mb-md">
        {article.author && <>{article.author} &bull; </>}
        {formatDate(article.publishedAt)}
        {article.link && (
          <>
            {" — "}
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80"
            >
              Original
            </a>
          </>
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
