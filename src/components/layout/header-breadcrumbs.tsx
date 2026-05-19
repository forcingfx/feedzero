import { ChevronDown, Layers, Star } from "lucide-react";
import { useNavigate } from "react-router";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { ALL_FEEDS_ID, STARRED_FEED_ID } from "@/utils/constants.ts";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";

interface HeaderBreadcrumbsProps {
  fallback?: string;
  onTriggerClick?: () => void;
}

/** Breadcrumb trail showing current feed and article in the header. */
export function HeaderBreadcrumbs({ fallback, onTriggerClick }: HeaderBreadcrumbsProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const navigate = useNavigate();

  const feed = feeds.find((f) => f.id === selectedFeedId);

  // Aggregated virtual feeds (ALL, STARRED, folder views) have no Feed
  // record but still deserve a real label in the breadcrumb. Render an
  // icon + name pair instead of falling through to the generic
  // "Articles" / "Feeds" fallback.
  if (!feed) {
    if (selectedFeedId === ALL_FEEDS_ID || selectedFeedId === STARRED_FEED_ID) {
      const label =
        selectedFeedId === ALL_FEEDS_ID ? "All items" : "Starred";
      const Icon = selectedFeedId === ALL_FEEDS_ID ? Layers : Star;
      const iconClass =
        selectedFeedId === STARRED_FEED_ID
          ? "size-4 shrink-0 text-amber-500"
          : "size-4 shrink-0";
      return (
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="shrink-0">
              <BreadcrumbLink
                onClick={onTriggerClick}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <Icon className={iconClass} />
                <span className="truncate">{label}</span>
                {onTriggerClick && (
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                )}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {selectedArticle && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {decodeEntities(selectedArticle.title)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      );
    }
    if (!fallback) return null;
    return onTriggerClick ? (
      <button
        type="button"
        className="text-sm font-medium truncate"
        onClick={onTriggerClick}
      >
        {fallback}
      </button>
    ) : (
      <span className="text-sm font-medium truncate">{fallback}</span>
    );
  }

  const handleFeedClick = onTriggerClick ?? (() => navigate(`/feeds/${feed.id}`));

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink
            onClick={handleFeedClick}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <FeedFavicon siteUrl={feed.siteUrl} className="size-4 shrink-0" />
            <span className="truncate">{feed.title}</span>
            {onTriggerClick && (
              <ChevronDown
                data-testid="feed-switcher-chevron"
                className="size-3 shrink-0 text-muted-foreground"
              />
            )}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {selectedArticle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">
                {decodeEntities(selectedArticle.title)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
