import { memo } from "react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import type { Article } from "@/types/index.ts";

interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  onSelect: (article: Article) => void;
  feedTitle?: string;
  feedSiteUrl?: string;
}

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

export const ArticleItem = memo(function ArticleItem({
  article,
  isSelected,
  onSelect,
  feedTitle,
  feedSiteUrl,
}: ArticleItemProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSelect(article);
    }
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      data-id={article.id}
      onClick={() => onSelect(article)}
      onKeyDown={handleKeyDown}
      className="pl-2 pr-3.5 py-2 border-b border-border cursor-pointer hover:bg-accent aria-selected:bg-accent aria-selected:border-l-2 aria-selected:border-l-primary flex gap-4 transition-colors duration-150"
    >
      <div className="min-w-0 flex-1 flex gap-2 items-start">
        <span
          className={`rounded-full size-1.5 shrink-0 mt-1.5 transition-colors duration-500 ${
            article.read ? "bg-transparent" : "bg-blue-400 dark:bg-blue-500"
          }`}
        />
        <div className="min-w-0">
          <div className={article.read ? "text-foreground/70" : "text-foreground font-medium"}>
            {decodeEntities(article.title)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {feedTitle && (
              <span className="font-medium">{feedTitle} &bull; </span>
            )}
            {article.author && <>{article.author} &bull; </>}
            {formatDate(article.publishedAt)}
          </div>
        </div>
      </div>
      {feedSiteUrl && (
        <FeedFavicon siteUrl={feedSiteUrl} className="size-4 shrink-0" />
      )}
    </li>
  );
});
