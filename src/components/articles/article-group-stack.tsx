import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { ArticleItem } from "./article-item.tsx";
import { cn } from "@/lib/utils.ts";
import type { Article } from "@/types/index.ts";
import type { ArticleGroup } from "@/lib/group-articles.ts";

interface ArticleGroupStackProps {
  group: ArticleGroup;
  selectedArticleId: string | undefined;
  onSelect: (article: Article) => void;
  /** Provided in aggregated views (e.g. /feeds/all, folder views). */
  feedTitle?: string;
  feedSiteUrl?: string;
}

/**
 * Visually stacked card group for "floods" — runs of same-feed articles
 * published close together. Collapsed: the top article looks like a
 * normal ArticleItem with 1-2 ghost cards offset behind and a "+N more"
 * chevron. Expanded: all N articles render inline as normal options.
 *
 * Keyboard-nav invariant: the chevron is a plain <button> (NOT
 * role="option") so j/k navigation skips it. The top card retains its
 * own role="option" so the user can still navigate to the head article.
 * When expanded, every inner ArticleItem becomes a role="option" and
 * j/k naturally walks through them.
 */
export function ArticleGroupStack({
  group,
  selectedArticleId,
  onSelect,
  feedTitle,
  feedSiteUrl,
}: ArticleGroupStackProps) {
  const [open, setOpen] = useState(false);
  const top = group.articles[0];
  if (!top) return null;
  const overflow = group.articles.length - 1;
  const ghostCount = Math.min(2, overflow);
  const stackLabel = feedTitle ?? "this feed";

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-group-id={group.id}>
      {!open ? (
        <div className="relative pb-2">
          {Array.from({ length: ghostCount }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              role="presentation"
              className="absolute left-0 right-0 mx-2 rounded-sm border border-border bg-card transition-all duration-200"
              style={{
                top: `${(i + 1) * 4}px`,
                height: "100%",
                opacity: 0.5 - i * 0.2,
                transform: `scaleX(${1 - (i + 1) * 0.03})`,
                zIndex: -1 - i,
              }}
            />
          ))}
          <ArticleItem
            article={top}
            isSelected={selectedArticleId === top.id}
            onSelect={onSelect}
            feedTitle={feedTitle}
            feedSiteUrl={feedSiteUrl}
          />
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`Show ${overflow} more articles from ${stackLabel}`}
              className={cn(
                "absolute right-2 bottom-1 inline-flex items-center gap-1",
                "min-h-11 min-w-11 justify-center rounded-full px-2",
                "text-xs text-muted-foreground hover:text-foreground",
                "active:scale-95 transition-all duration-200",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              +{overflow} more
              <ChevronDown className="size-3" />
            </button>
          </CollapsibleTrigger>
        </div>
      ) : (
        <CollapsibleContent>
          <ul role="presentation" className="list-none p-0 m-0">
            {group.articles.map((article) => (
              <ArticleItem
                key={article.id}
                article={article}
                isSelected={selectedArticleId === article.id}
                onSelect={onSelect}
                feedTitle={feedTitle}
                feedSiteUrl={feedSiteUrl}
              />
            ))}
          </ul>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`Collapse ${stackLabel} group`}
              className="block w-full min-h-11 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              Collapse
            </button>
          </CollapsibleTrigger>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
