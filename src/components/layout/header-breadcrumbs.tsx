import { ChevronDown, Layers, Star, Filter, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  isFilterFeedId,
  fromFilterFeedId,
} from "@feedzero/core/utils/constants";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";
import type { SmartFilter } from "@feedzero/core/types";

interface HeaderBreadcrumbsProps {
  fallback?: string;
  onTriggerClick?: () => void;
}

interface VirtualFeedLabel {
  label: string;
  Icon: LucideIcon;
  iconClass: string;
}

/**
 * Resolve the icon + label for a virtual feed id (ALL / STARRED /
 * filter:<id>). Returns null when the id isn't a known virtual feed,
 * letting the caller fall through to its concrete-feed / fallback path.
 */
function resolveVirtualFeed(
  selectedFeedId: string | null,
  smartFilters: SmartFilter[],
): VirtualFeedLabel | null {
  if (selectedFeedId === ALL_FEEDS_ID) {
    return {
      label: "All items",
      Icon: Layers,
      iconClass: "size-4 shrink-0",
    };
  }
  if (selectedFeedId === STARRED_FEED_ID) {
    return {
      label: "Starred",
      Icon: Star,
      iconClass: "size-4 shrink-0 text-amber-500",
    };
  }
  if (selectedFeedId && isFilterFeedId(selectedFeedId)) {
    const id = fromFilterFeedId(selectedFeedId);
    const filter = smartFilters.find((f) => f.id === id);
    return {
      label: filter?.name ?? "Filter",
      Icon: Filter,
      iconClass: "size-4 shrink-0 text-violet-500",
    };
  }
  return null;
}

/** Breadcrumb trail showing current feed and article in the header. */
export function HeaderBreadcrumbs({ fallback, onTriggerClick }: HeaderBreadcrumbsProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const smartFilters = useSmartFilterStore((s) => s.filters);
  const navigate = useNavigate();

  const feed = feeds.find((f) => f.id === selectedFeedId);

  // Aggregated virtual feeds (ALL, STARRED, filter views, folder views)
  // have no Feed record but still deserve a real label in the breadcrumb.
  // Render an icon + name pair instead of falling through to the generic
  // "Articles" / "Feeds" fallback.
  if (!feed) {
    const virtual = resolveVirtualFeed(selectedFeedId, smartFilters);
    if (virtual) {
      const { label, Icon, iconClass } = virtual;
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
