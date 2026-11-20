import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { formatRelative } from "@/lib/format-relative.ts";
import { articleListPreview } from "@/lib/article-list-preview.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import type { Article, ArticleImagePosition } from "@feedzero/core/types";

interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  /** Draw the selected row's highlight. Off on mobile; aria-selected is set either way. */
  highlightSelected?: boolean;
  onSelect: (article: Article) => void;
  feedTitle?: string;
  /** Source site, for the favicon that leads the meta line; the caller gates it on the user's setting. */
  feedSiteUrl?: string;
  /** Lead image to show at the left; the caller gates it on the user's setting. */
  imageUrl?: string;
  /** Show up to two lines of the article's opening text under the title. */
  showPreview?: boolean;
  /** Which side of the row the lead image sits on. */
  imagePosition?: ArticleImagePosition;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Middle dot between meta fields; decorative, so hidden from screen readers. */
function MetaSeparator() {
  return (
    <span aria-hidden="true" className="shrink-0">
      &bull;
    </span>
  );
}

export const ArticleItem = memo(function ArticleItem({
  article,
  isSelected,
  highlightSelected = true,
  onSelect,
  feedTitle,
  feedSiteUrl,
  imageUrl,
  showPreview = false,
  imagePosition = "left",
}: ArticleItemProps) {
  const preview = useMemo(
    () => (showPreview ? articleListPreview(article) : ""),
    [showPreview, article],
  );
  // Feeds such as YouTube set every item's author to the channel name;
  // printing it after the feed name says the same thing twice.
  const author =
    article.author && article.author.trim() !== feedTitle?.trim()
      ? article.author
      : undefined;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSelect(article);
    }
  }

  const leadImage = imageUrl ? (
    <img
      data-testid="article-image"
      src={`/api/icon?url=${encodeURIComponent(imageUrl)}`}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="size-[3.5em] max-lg:size-[4.5em] shrink-0 rounded-md object-cover bg-muted"
      onError={(e) => {
        // A dead or non-image URL leaves no broken-image box behind.
        e.currentTarget.style.display = "none";
      }}
    />
  ) : null;

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      data-id={article.id}
      onClick={() => onSelect(article)}
      onKeyDown={handleKeyDown}
      className={cn(
        "pl-2 pr-3.5 py-[0.5em] max-lg:py-[0.75em] border-b border-border border-l-2 border-l-transparent cursor-pointer hover:bg-accent flex gap-3 transition-colors duration-150",
        highlightSelected && "aria-selected:bg-accent aria-selected:border-l-primary",
      )}
    >
      {imagePosition === "left" && leadImage}
      <div className="min-w-0 flex-1 flex gap-2 items-start">
        <span
          className={`rounded-full size-1.5 shrink-0 mt-[0.55em] transition-colors duration-500 ${
 article.read ?"bg-transparent" : "bg-info "
          }`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "leading-snug",
              article.read ? "text-foreground/70" : "text-foreground font-medium",
            )}
          >
            {decodeEntities(article.title)}
          </div>
          {preview && (
            <p
              data-testid="article-item-preview"
              className="mt-[0.2em] text-[0.875em] leading-snug text-muted-foreground line-clamp-2"
            >
              {preview}
            </p>
          )}
          {/* One row that never wraps: the feed name and author truncate,
              the time keeps its width. Sizes are in em so the whole line
              follows the list size preference. */}
          <div
            data-testid="article-item-meta"
            className="mt-[0.35em] flex min-w-0 items-center gap-[0.4em] text-[0.8em] max-lg:text-[0.85em] text-muted-foreground"
          >
            {feedSiteUrl && (
              <FeedFavicon siteUrl={feedSiteUrl} className="size-[1.2em]" />
            )}
            {feedTitle && <span className="truncate font-medium">{feedTitle}</span>}
            {feedTitle && author && <MetaSeparator />}
            {author && <span className="truncate">{author}</span>}
            {(feedTitle || author) && Boolean(article.publishedAt) && <MetaSeparator />}
            {Boolean(article.publishedAt) && (
              <time
                dateTime={new Date(article.publishedAt).toISOString()}
                title={formatFullDate(article.publishedAt)}
                className="shrink-0"
              >
                {formatRelative(article.publishedAt)}
              </time>
            )}
          </div>
        </div>
      </div>
      {article.starred && (
        <div data-testid="article-item-side" className="shrink-0 py-0.5">
          <Star
            data-testid="article-star-indicator"
            aria-label="Starred"
            className="size-[0.9em] text-warning fill-current"
          />
        </div>
      )}
      {imagePosition === "right" && leadImage}
    </li>
  );
});
