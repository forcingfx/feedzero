import { memo } from "react";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import type { Article } from "@feedzero/core/types";
import { proxiedImageUrl } from "@/core/proxy/proxy-article-images.ts";

interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  /** Draw the selected row's highlight. Off on mobile; aria-selected is set either way. */
  highlightSelected?: boolean;
  onSelect: (article: Article) => void;
  feedTitle?: string;
  feedSiteUrl?: string;
  /** Lead image to show at the left; the caller gates it on the user's setting. */
  imageUrl?: string;
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
  highlightSelected = true,
  onSelect,
  feedTitle,
  feedSiteUrl,
  imageUrl,
}: ArticleItemProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSelect(article);
    }
  }

  // Star + favicon share a dedicated right-hand column so the title stays
  // a single horizontal flow. Star is the prime top-right slot (always
  // tappable area visually); when a favicon also renders (global / starred
  // views), it moves to the bottom-right under the star. Empty column
  // shouldn't render — it would steal gap from the title.
  const showSide = article.starred || Boolean(feedSiteUrl);

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      data-id={article.id}
      onClick={() => onSelect(article)}
      onKeyDown={handleKeyDown}
      className={cn(
        "pl-2 pr-3.5 py-2 border-b border-border border-l-2 border-l-transparent cursor-pointer hover:bg-accent flex gap-3 transition-colors duration-150",
        highlightSelected && "aria-selected:bg-accent aria-selected:border-l-primary",
      )}
    >
      {imageUrl && (
        <img
          data-testid="article-image"
          src={proxiedImageUrl(imageUrl, "icon")}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-14 shrink-0 rounded-md object-cover bg-muted"
          onError={(e) => {
            // A dead or non-image URL leaves no broken-image box behind.
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1 flex gap-2 items-start">
        <span
          className={`rounded-full size-1.5 shrink-0 mt-1.5 transition-colors duration-500 ${
 article.read ?"bg-transparent" : "bg-info "
          }`}
        />
        <div className="min-w-0">
          <div
            className={
              article.read
                ? "text-foreground/70"
                : "text-foreground font-medium"
            }
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
      </div>
      {showSide && (
        <div
          data-testid="article-item-side"
          className="flex flex-col items-end justify-between shrink-0 py-0.5"
        >
          {article.starred && (
            <Star
              data-testid="article-star-indicator"
              aria-label="Starred"
              className="size-3.5 text-warning fill-current"
            />
          )}
          {feedSiteUrl && (
            <FeedFavicon siteUrl={feedSiteUrl} className="size-4" />
          )}
        </div>
      )}
    </li>
  );
});
