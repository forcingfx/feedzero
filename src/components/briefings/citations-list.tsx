import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";
import type { BriefingCitation } from "@feedzero/core/types";

interface Props {
  citations: BriefingCitation[];
  onOpenInReader: (articleId: string) => void;
}

/**
 * Renders the citation strip beneath the briefing abstract. Each entry
 * resolves the cited article via article-store + feed-store so the row
 * carries the source feed title + the article title (not just a UUID).
 * Click → open in reader.
 *
 * A citation whose articleId no longer resolves (article deleted from
 * the cache between briefing generation and viewing) renders the quote
 * with a muted "Source no longer available" tag rather than vanishing,
 * so the abstract's [A1] chip still has something to link to.
 */
export function CitationsList({ citations, onOpenInReader }: Props) {
  const articles = useArticleStore((s) => s.articlesByFeedId);
  const feeds = useFeedStore((s) => s.feeds);

  function findArticle(articleId: string) {
    for (const list of Object.values(articles)) {
      const hit = list.find((a) => a.id === articleId);
      if (hit) return hit;
    }
    return null;
  }

  function feedTitle(feedId: string): string {
    return feeds.find((f) => f.id === feedId)?.title ?? "Unknown feed";
  }

  if (citations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No citations were attached to this briefing.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {citations.map((c, i) => {
        const article = findArticle(c.articleId);
        return (
          <li
            key={`${c.articleId}-${i}`}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-primary">A{i + 1}</span>
              {article ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onOpenInReader(article.id)}
                >
                  <ExternalLink className="size-3" />
                  Open in reader
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-sm">
              {article ? article.title : (
                <span className="italic text-muted-foreground">
                  Source no longer available
                </span>
              )}
            </p>
            {article ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {feedTitle(article.feedId)}
              </p>
            ) : null}
            <p className="mt-2 border-l-2 border-muted pl-2 text-sm italic text-muted-foreground">
              {c.quote}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
