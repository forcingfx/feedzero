import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useArticleStore, selectUnreadCount } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { isFeedStale } from "@/lib/stale-feed.ts";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import type { Feed } from "@/types/index.ts";

interface FeedItemProps {
  feed: Feed;
  isSelected: boolean;
  inFolder?: boolean;
  /** When true, uses @dnd-kit/sortable for reorder-in-place behavior. */
  sortable?: boolean;
  onSelect: () => void;
}

/**
 * Sidebar feed row. Select-only — every per-feed action (rename,
 * preferences, rules, refresh, clear cache, delete) lives in
 * FeedSettingsDialog now, opened from the floating cog above the
 * article list. The row keeps the favicon, title, refresh/stale/
 * failed-fetch indicators, unread badge, and drag handle for reorder.
 */
export function FeedItem({
  feed,
  isSelected,
  inFolder = false,
  sortable = false,
  onSelect,
}: FeedItemProps) {
  const unreadCount = useArticleStore((s) => selectUnreadCount(s, feed.id));
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);
  const isRefreshing = refreshingFeedIds.has(feed.id);

  // Both hooks are always called (hooks must not be conditional).
  // Only one is active at a time: disabled=true keeps the hook from registering.
  const draggable = useDraggable({ id: feed.id, disabled: sortable });
  const sortableHook = useSortable({ id: feed.id, disabled: !sortable });

  const dragRef = sortable ? sortableHook.setNodeRef : draggable.setNodeRef;
  const dragListeners = sortable ? sortableHook.listeners : draggable.listeners;
  const isDragging = sortable ? sortableHook.isDragging : draggable.isDragging;
  const sortStyle: React.CSSProperties =
    sortable && sortableHook.transform
      ? { transform: CSS.Transform.toString(sortableHook.transform), transition: sortableHook.transition }
      : {};

  return (
    <SidebarMenuItem
      ref={dragRef}
      style={{ opacity: isDragging ? 0.4 : 1, ...sortStyle }}
      className={inFolder ? "pl-4" : ""}
      {...dragListeners}
    >
      <SidebarMenuButton isActive={isSelected} onClick={onSelect}>
        <FeedFavicon siteUrl={feed.siteUrl} />
        <span className="truncate">{feed.title}</span>
        {isRefreshing && (
          <RefreshCw className="size-3 animate-spin shrink-0 text-muted-foreground" />
        )}
        {/* Failed-fetch indicator: a placeholder feed that has never
            successfully refreshed. Takes precedence over the stale
            indicator — a feed that never loaded is more pressing than
            a stale one. */}
        {!isRefreshing && feed.lastError && !feed.lastSuccessfulFetchAt && (
          <XCircle
            className="size-3 shrink-0 text-destructive"
            aria-label={feed.lastError}
            data-testid="failed-feed-indicator"
          />
        )}
        {!isRefreshing && !feed.lastError && isFeedStale(feed) && (
          <AlertTriangle
            className="size-3 shrink-0 text-amber-500"
            aria-label="This feed hasn't updated in over 14 days"
            data-testid="stale-feed-indicator"
          />
        )}
      </SidebarMenuButton>
      {!isRefreshing && unreadCount > 0 && (
        <SidebarMenuBadge className="rounded-lg bg-primary/10 text-primary text-[10px] font-semibold max-md:hidden">
          {unreadCount > 99 ? "99+" : unreadCount}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}
