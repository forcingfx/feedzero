import { useState } from "react";
import { Check, MoreHorizontal, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils.ts";
import { useArticleStore, selectUnreadCount } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import {
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { Feed } from "@/types/index.ts";

interface FeedItemProps {
  feed: Feed;
  isSelected: boolean;
  inFolder?: boolean;
  /** When true, uses @dnd-kit/sortable for reorder-in-place behavior. */
  sortable?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReload: () => void;
}

export function FeedItem({ feed, isSelected, inFolder = false, sortable = false, onSelect, onRemove, onReload }: FeedItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const unreadCount = useArticleStore((s) => selectUnreadCount(s, feed.id));
  const renameFeed = useFeedStore((s) => s.renameFeed);
  const setFeedPreferFullText = useFeedStore((s) => s.setFeedPreferFullText);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);
  const folders = useFeedStore((s) => s.folders);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);
  const isRefreshing = refreshingFeedIds.has(feed.id);

  // Both hooks are always called (hooks must not be conditional).
  // Only one is active at a time: disabled=true keeps the hook from registering.
  const draggable = useDraggable({ id: feed.id, disabled: sortable });
  const sortableHook = useSortable({ id: feed.id, disabled: !sortable });

  const dragRef = sortable ? sortableHook.setNodeRef : draggable.setNodeRef;
  const dragListeners = sortable ? sortableHook.listeners : draggable.listeners;
  const isDragging = sortable ? sortableHook.isDragging : draggable.isDragging;
  const sortStyle: React.CSSProperties = sortable && sortableHook.transform
    ? { transform: CSS.Transform.toString(sortableHook.transform), transition: sortableHook.transition }
    : {};

  function handleStartRename() {
    setRenameValue(feed.title);
    setIsRenaming(true);
  }

  function handleSubmitRename(e: React.FormEvent) {
    e.preventDefault();
    if (renameValue.trim()) renameFeed(feed.id, renameValue.trim());
    setIsRenaming(false);
  }

  return (
    <SidebarMenuItem
      ref={dragRef}
      style={{ opacity: isDragging ? 0.4 : 1, ...sortStyle }}
      className={inFolder ? "pl-4" : ""}
      {...dragListeners}
    >
      {isRenaming ? (
        <form className="flex items-center gap-2 px-2 py-1" onSubmit={handleSubmitRename}>
          <FeedFavicon siteUrl={feed.siteUrl} />
          <input
            role="textbox"
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none border-b border-primary min-w-0"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => setIsRenaming(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setIsRenaming(false); }}
          />
        </form>
      ) : (
        <SidebarMenuButton isActive={isSelected} onClick={onSelect}>
          <FeedFavicon siteUrl={feed.siteUrl} />
          <span className="truncate">{feed.title}</span>
          {isRefreshing && <RefreshCw className="size-3 animate-spin shrink-0 text-muted-foreground" />}
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover className="focus-visible:ring-0">
            <MoreHorizontal />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={handleStartRename}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setFeedPreferFullText(feed.id, !feed.preferFullText)}
          >
            <Check
              className={cn(
                "size-4",
                feed.preferFullText ? "opacity-100" : "opacity-0",
              )}
            />
            Prefer full text
          </DropdownMenuItem>
          {folders.length > 0 && (
            <>
              <DropdownMenuItem onClick={() => moveFeedToFolder(feed.id, null)} disabled={!feed.folderId}>
                Unfiled
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => moveFeedToFolder(feed.id, f.id)} disabled={feed.folderId === f.id}>
                  → {f.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem onClick={() => refreshSingleFeed(feed.id)}>
            <RefreshCw className="size-4" /> Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReload}>
            <RotateCcw className="size-4" /> Clear cached articles
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!isRefreshing && unreadCount > 0 && (
        <SidebarMenuBadge className="rounded-lg bg-primary/10 text-primary text-[10px] font-semibold group-hover/menu-item:opacity-0 group-has-[[data-state=open]]/menu-item:opacity-0 max-md:hidden">
          {unreadCount > 99 ? "99+" : unreadCount}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}
