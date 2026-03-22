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
    if (e.key === "Enter" || e.key === " ") {
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
      className="px-2 py-2 border-b border-border cursor-pointer hover:bg-accent aria-selected:bg-accent flex gap-4"
    >
      <div className={`min-w-0 flex-1 ${article.read ? "opacity-60" : ""}`}>
        <div
          className={article.read ? "text-muted-foreground" : "text-foreground"}
        >
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
      {feedSiteUrl && (
        <FeedFavicon siteUrl={feedSiteUrl} className="size-4 shrink-0" />
      )}
    </li>
  );
});
