import { useState, useMemo } from "react";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { ArrowUpDown, Check } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore, selectUnreadCount } from "@/stores/article-store.ts";
import { toFolderFeedId } from "@/utils/constants.ts";
import { SidebarSeparator } from "@/components/ui/sidebar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { FeedItem } from "./feed-item.tsx";
import { FolderItem } from "./folder-item.tsx";
import { NewFolderInput } from "./new-folder-input.tsx";
import { FeedRemoveDialog } from "./feed-remove-dialog.tsx";
import { FeedReloadDialog } from "./feed-reload-dialog.tsx";
import { FolderDeleteDialog } from "./folder-delete-dialog.tsx";
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill.tsx";
import type { Feed, Folder } from "@/types/index.ts";

interface SidebarFeedListProps {
  onFeedSelect: (feedId: string) => void;
}

function UnfiledDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unfiled" });
  return (
    <div ref={setNodeRef} className={isOver ? "bg-accent/50 rounded-md transition-colors" : "transition-colors"}>
      {children}
    </div>
  );
}

/** Sort feed IDs by a stored custom order; feeds not in the order go to the end. */
function applyCustomOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

const SORT_LABELS: Record<string, string> = {
  name: "By name",
  count: "By count",
  custom: "Custom order",
};

export function SidebarFeedList({ onFeedSelect }: SidebarFeedListProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);
  const feedSortMode = useFeedStore((s) => s.feedSortMode);
  const feedCustomOrder = useFeedStore((s) => s.feedCustomOrder);
  const folderCustomOrder = useFeedStore((s) => s.folderCustomOrder);
  const setFeedSortMode = useFeedStore((s) => s.setFeedSortMode);
  const reorderFeeds = useFeedStore((s) => s.reorderFeeds);
  const reorderFolders = useFeedStore((s) => s.reorderFolders);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [feedToRemove, setFeedToRemove] = useState<Feed | null>(null);
  const [feedToReload, setFeedToReload] = useState<Feed | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const unfiledFeeds = useMemo(() => feeds.filter((f) => !f.folderId), [feeds]);
  const feedsByFolder = useMemo(() => {
    const map = new Map<string, Feed[]>();
    for (const feed of feeds) {
      if (!feed.folderId) continue;
      const list = map.get(feed.folderId);
      if (list) list.push(feed);
      else map.set(feed.folderId, [feed]);
    }
    return map;
  }, [feeds]);

  const sortedUnfiledFeeds = useMemo(() => {
    if (feedSortMode === "count") {
      return [...unfiledFeeds].sort(
        (a, b) =>
          selectUnreadCount({ articlesByFeedId }, b.id) -
          selectUnreadCount({ articlesByFeedId }, a.id),
      );
    }
    if (feedSortMode === "custom") {
      return applyCustomOrder(unfiledFeeds, feedCustomOrder);
    }
    return unfiledFeeds;
  }, [unfiledFeeds, feedSortMode, feedCustomOrder, articlesByFeedId]);

  const sortedFolders = useMemo(() => {
    if (feedSortMode === "count") {
      return [...folders].sort((a, b) => {
        const aFeeds = feedsByFolder.get(a.id) ?? [];
        const bFeeds = feedsByFolder.get(b.id) ?? [];
        const aCount = aFeeds.reduce((sum, f) => sum + selectUnreadCount({ articlesByFeedId }, f.id), 0);
        const bCount = bFeeds.reduce((sum, f) => sum + selectUnreadCount({ articlesByFeedId }, f.id), 0);
        return bCount - aCount;
      });
    }
    if (feedSortMode === "custom") {
      return applyCustomOrder(folders, folderCustomOrder);
    }
    return folders;
  }, [folders, feedSortMode, folderCustomOrder, feedsByFolder, articlesByFeedId]);

  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as string;
    const overId = over.id as string;
    const draggedIsFolder = folderIds.has(draggedId);
    const overIsFolder = folderIds.has(overId);

    // Custom mode: reorder folders when both sides of the drag are folders.
    // Must be checked BEFORE the feed→folder branch below, otherwise dragging
    // folder A over folder B would file folder A inside folder B.
    if (feedSortMode === "custom" && draggedIsFolder && overIsFolder) {
      const currentOrder = sortedFolders.map((f) => f.id);
      const oldIdx = currentOrder.indexOf(draggedId);
      const newIdx = currentOrder.indexOf(overId);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        reorderFolders(arrayMove(currentOrder, oldIdx, newIdx));
      }
      return;
    }

    // Feed dragged over a folder → move feed into folder
    if (overIsFolder && !draggedIsFolder) {
      moveFeedToFolder(draggedId, overId);
      return;
    }
    if (overId === "unfiled" && !draggedIsFolder) {
      moveFeedToFolder(draggedId, null);
      return;
    }

    // Custom mode: reorder unfiled feeds
    if (feedSortMode === "custom" && unfiledFeeds.some((f) => f.id === draggedId)) {
      const currentOrder = sortedUnfiledFeeds.map((f) => f.id);
      const oldIdx = currentOrder.indexOf(draggedId);
      const newIdx = currentOrder.indexOf(overId);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        reorderFeeds(arrayMove(currentOrder, oldIdx, newIdx));
      }
    }
  }

  const removeFeed = useFeedStore((s) => s.removeFeed);
  const reloadSingleFeed = useFeedStore((s) => s.reloadSingleFeed);
  const deleteFolder = useFeedStore((s) => s.deleteFolder);

  const isCustomMode = feedSortMode === "custom";
  const sortableIds = isCustomMode ? sortedUnfiledFeeds.map((f) => f.id) : [];
  const folderSortableIds = isCustomMode ? sortedFolders.map((f) => f.id) : [];

  return (
    <>
      {/* Sort toggle — only shown when there are feeds */}
      {feeds.length > 0 && (
        <div className="flex items-center justify-end px-1 py-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="sort-toggle"
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={`Sort: ${SORT_LABELS[feedSortMode]}`}
              >
                <ArrowUpDown className="size-3" />
                <span>{SORT_LABELS[feedSortMode]}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              {(["name", "count", "custom"] as const).map((mode) => (
                <DropdownMenuItem key={mode} onClick={() => setFeedSortMode(mode)}>
                  <Check className={`size-3.5 mr-1.5 ${feedSortMode === mode ? "opacity-100" : "opacity-0"}`} />
                  {SORT_LABELS[mode]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveDragId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <UnfiledDropZone>
            {sortedUnfiledFeeds.map((feed) => (
              <FeedItem
                key={feed.id}
                feed={feed}
                isSelected={feed.id === selectedFeedId}
                sortable={isCustomMode}
                onSelect={() => onFeedSelect(feed.id)}
                onRemove={() => setFeedToRemove(feed)}
                onReload={() => setFeedToReload(feed)}
              />
            ))}
          </UnfiledDropZone>
        </SortableContext>

        <SortableContext items={folderSortableIds} strategy={verticalListSortingStrategy}>
          {sortedFolders.map((folder) => {
            const folderFeeds = feedsByFolder.get(folder.id) ?? [];
            const sortedFolderFeeds = feedSortMode === "count"
              ? [...folderFeeds].sort(
                  (a, b) =>
                    selectUnreadCount({ articlesByFeedId }, b.id) -
                    selectUnreadCount({ articlesByFeedId }, a.id),
                )
              : folderFeeds;
            return (
              <FolderItem
                key={folder.id}
                folder={folder}
                sortable={isCustomMode}
                isSelected={selectedFeedId === toFolderFeedId(folder.id)}
                onSelect={() => onFeedSelect(toFolderFeedId(folder.id))}
                onDelete={() => setFolderToDelete(folder)}
              >
                {sortedFolderFeeds.map((feed) => (
                  <FeedItem
                    key={feed.id}
                    feed={feed}
                    isSelected={feed.id === selectedFeedId}
                    inFolder
                    onSelect={() => onFeedSelect(feed.id)}
                    onRemove={() => setFeedToRemove(feed)}
                    onReload={() => setFeedToReload(feed)}
                  />
                ))}
              </FolderItem>
            );
          })}
        </SortableContext>

        <DragOverlay>
          {activeDragId ? (
            <div className="rounded-md bg-card border shadow-lg px-3 py-1.5 text-sm">
              {feeds.find((f) => f.id === activeDragId)?.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <SidebarSeparator className="mx-0 my-1" />
      <NewFolderInput trailing={<AutoOrganizePill />} />

      <FeedRemoveDialog
        feedTitle={feedToRemove?.title ?? ""}
        open={feedToRemove !== null}
        onOpenChange={(open) => { if (!open) setFeedToRemove(null); }}
        onConfirm={() => { if (feedToRemove) { removeFeed(feedToRemove.id); setFeedToRemove(null); } }}
      />
      <FeedReloadDialog
        feedTitle={feedToReload?.title ?? ""}
        open={feedToReload !== null}
        onOpenChange={(open) => { if (!open) setFeedToReload(null); }}
        onConfirm={() => { if (feedToReload) { reloadSingleFeed(feedToReload.id); setFeedToReload(null); } }}
      />
      <FolderDeleteDialog
        folderName={folderToDelete?.name ?? ""}
        open={folderToDelete !== null}
        onOpenChange={(open) => { if (!open) setFolderToDelete(null); }}
        onConfirm={() => { if (folderToDelete) { deleteFolder(folderToDelete.id); setFolderToDelete(null); } }}
      />
    </>
  );
}
