import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { extractImage } from "@/lib/extract-image.ts";
import { formatRelative } from "@/lib/format-relative.ts";
import type { Article, Feed } from "@/types/index.ts";

interface SwimlaneCardProps {
  article: Article;
  feed?: Feed;
  onOpen: (article: Article) => void;
}

/**
 * Compact card for a single article in a horizontal swimlane. Fixed width
 * so the parent's overflow-x-auto scroller works as a snap track on mobile
 * and a scrollable row on desktop.
 */
export function SwimlaneCard({ article, feed, onOpen }: SwimlaneCardProps) {
  const image = extractImage(article);
  return (
    <article
      onClick={() => onOpen(article)}
      className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40 w-[16rem] shrink-0 snap-start"
    >
      {image && (
        <div className="relative w-full overflow-hidden bg-muted aspect-[16/10]">
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="p-3">
        <h4 className="text-sm font-medium leading-snug tracking-tight line-clamp-3">
          {decodeEntities(article.title)}
        </h4>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {feed && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <FeedFavicon siteUrl={feed.siteUrl || feed.url} className="size-3.5" />
              <span className="truncate max-w-[7rem]">{feed.title}</span>
            </span>
          )}
          <span data-testid="swimlane-card-date" className="ml-auto shrink-0">
            {formatRelative(article.publishedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}
