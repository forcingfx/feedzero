import { ExternalLink } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";
import { CitationPreview } from "./citation-preview";
import type { BriefingCitation } from "@feedzero/core/types";

interface Props {
  citations: BriefingCitation[];
}

/**
 * Citations strip beneath the briefing abstract. Each row wraps in
 * <CitationPreview> so it behaves identically to the inline [A1]
 * chips above — HoverCard on desktop, bottom Sheet on mobile, the
 * same Signal-style <ArticlePreview> inside. One interaction model
 * across the whole briefing page.
 *
 * A citation whose articleId no longer resolves (article evicted
 * from cache between briefing generation and viewing) renders the
 * quote with a muted "Source no longer available" tag rather than
 * vanishing, so the abstract's [A1] chip still has a row to point
 * to in the references.
 */
export function CitationsList({ citations }: Props) {
  const articles = useArticleStore((s) => s.articlesByFeedId);
  const feeds = useFeedStore((s) => s.feeds);

  function findArticle(articleId: string) {
    for (const list of Object.values(articles)) {
      const hit = list.find((a) => a.id === articleId);
      if (hit) return hit;
    }
    return null;
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
        const feed = article ? feeds.find((f) => f.id === article.feedId) : undefined;
        const row = (
          <div className="block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-primary">A{i + 1}</span>
              {article ? (
                <span className="flex items-baseline gap-1 text-xs text-muted-foreground">
                  <ExternalLink className="size-3" />
                  Preview
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-medium">
              {article ? article.title : (
                <span className="italic text-muted-foreground">
                  Source no longer available
                </span>
              )}
            </p>
            {feed ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {feed.title}
              </p>
            ) : null}
            <p className="mt-2 border-l-2 border-muted pl-2 text-sm italic text-muted-foreground">
              {c.quote}
            </p>
          </div>
        );

        return (
          <li key={`${c.articleId}-${i}`}>
            <CitationPreview article={article} feed={feed}>
              {row}
            </CitationPreview>
          </li>
        );
      })}
    </ol>
  );
}
