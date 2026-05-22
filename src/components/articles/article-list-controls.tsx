import { Layers, Star, Filter, Folder as FolderIcon, RefreshCw } from "lucide-react";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { ExpandingPill } from "@/components/ui/expanding-pill.tsx";
import { SortPill } from "./sort-pill.tsx";
import { SettingsPill } from "./settings-pill.tsx";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  isFolderFeedId,
  fromFolderFeedId,
  isFilterFeedId,
  fromFilterFeedId,
} from "@/utils/constants.ts";
import type { ArticleSortMode } from "@/types/index.ts";

interface ArticleListControlsProps {
  sortMode: ArticleSortMode;
  onSortChange: (mode: ArticleSortMode) => void;
}

/**
 * Sticky title bar at the top of the article-list panel. Shows the
 * current feed indicator on the left and the floating control pills
 * (cog + sort) on the right. Pills are icon-only at rest and expand
 * on hover / focus / tap; the flex layout keeps them from
 * overlapping when one expands (the rightmost stays anchored at the
 * right edge, the leftmost shifts).
 *
 * Hidden on mobile — the global header in `app-layout.tsx` carries
 * the breadcrumb + pills there, so there's nothing left to show here.
 */
export function ArticleListControls({
  sortMode,
  onSortChange,
}: ArticleListControlsProps) {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <div
      data-testid="article-list-controls"
      className="sticky top-0 z-10 flex items-center gap-2 px-3 h-12 border-b bg-background/80 backdrop-blur-sm"
    >
      <FeedIndicator />
      <div className="ml-auto flex items-center gap-2 pointer-events-auto">
        <SettingsPill />
        <SortPill mode={sortMode} onChange={onSortChange} />
      </div>
    </div>
  );
}

/**
 * Inline feed indicator — icon + truncated name for whichever view
 * is selected. Mirrors HeaderBreadcrumbs's virtual-feed resolution
 * but drops the article slot (the article-list view is already
 * showing the articles; surfacing one in a breadcrumb here would
 * duplicate context with the reader panel).
 */
function FeedIndicator() {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const smartFilters = useSmartFilterStore((s) => s.filters);

  if (!selectedFeedId) return <span className="text-sm font-medium" />;

  if (selectedFeedId === ALL_FEEDS_ID) {
    return (
      <Label icon={<Layers className="size-4 shrink-0" />}>All items</Label>
    );
  }
  if (selectedFeedId === STARRED_FEED_ID) {
    return (
      <Label
        icon={<Star className="size-4 shrink-0 text-amber-500" />}
      >
        Starred
      </Label>
    );
  }
  if (isFolderFeedId(selectedFeedId)) {
    const id = fromFolderFeedId(selectedFeedId);
    const folder = folders.find((f) => f.id === id);
    return (
      <Label
        icon={<FolderIcon className="size-4 shrink-0 text-violet-500" />}
      >
        {folder?.name ?? "Folder"}
      </Label>
    );
  }
  if (isFilterFeedId(selectedFeedId)) {
    const id = fromFilterFeedId(selectedFeedId);
    const filter = smartFilters.find((f) => f.id === id);
    return (
      <Label icon={<Filter className="size-4 shrink-0 text-violet-500" />}>
        {filter?.name ?? "Filter"}
      </Label>
    );
  }

  const feed = feeds.find((f) => f.id === selectedFeedId);
  if (!feed) return <span className="text-sm font-medium" />;
  return (
    <Label icon={<FeedFavicon siteUrl={feed.siteUrl} className="size-4 shrink-0" />}>
      {feed.title}
    </Label>
  );
}

function Label({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * Bare pair of pills (cog + sort), no title, no sticky positioning.
 * Mounted in the mobile global header alongside HeaderBreadcrumbs so
 * the user reaches feed/folder/filter settings from the same bar that
 * shows where they are. The full title-bar shape
 * (ArticleListControls) is desktop-only.
 */
export function MobileHeaderPills() {
  const articleSortMode = useArticleStore((s) => s.articleSortMode);
  const setArticleSortMode = useArticleStore((s) => s.setArticleSortMode);
  return (
    <div
      data-testid="mobile-header-pills"
      className="flex items-center gap-2"
    >
      <RefreshPill />
      <SettingsPill />
      <SortPill mode={articleSortMode} onChange={setArticleSortMode} />
    </div>
  );
}

/**
 * Refresh control for the mobile header. The desktop refresh lives in the
 * sidebar header, which mobile never renders — without this the only way to
 * refresh on mobile was the (also-hidden) keyboard `r`. Scoped to the current
 * view via `refreshView`: a single feed refreshes only that feed, a folder
 * only its members, an aggregated view (All / Starred / filter) every feed.
 * Hidden when there are no feeds, mirroring the desktop button.
 */
function RefreshPill() {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const refreshView = useFeedStore((s) => s.refreshView);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);

  if (feeds.length === 0) return null;

  return (
    <ExpandingPill
      icon={<RefreshCw className={isRefreshingAll ? "animate-spin" : ""} />}
      label={isRefreshingAll ? "Refreshing…" : "Refresh"}
      aria-label="Refresh"
      dataTestId="mobile-refresh"
      disabled={isRefreshingAll}
      onClick={() =>
        void (selectedFeedId ? refreshView(selectedFeedId) : refreshAll())
      }
    />
  );
}
