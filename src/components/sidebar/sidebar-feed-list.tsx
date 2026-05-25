import { useState, useMemo } from "react";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DndContext, DragOverlay, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { buildFeedListSensorDescriptors } from "@/lib/feed-list-dnd-sensors.ts";
import { ArrowUpDown, Check } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore, selectUnreadCount } from "@/stores/article-store.ts";
import { toFolderFeedId } from "@feedzero/core/utils/constants";
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
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill.tsx";
import type { Feed } from "@feedzero/core/types";

interface SidebarFeedListProps {
  onFeedSelect: (feedId: string) => void;
  /**
   * When true, suppress the inline "New folder" affordance at the bottom
   * of the list. The mobile drawer renders its own copy in the pinned
   * footer so it stays reachable regardless of feed-list length.
   */
  hideNewFolderInput?: boolean;
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

export function SidebarFeedList({
  onFeedSelect,
  hideNewFolderInput,
}: SidebarFeedListProps) {
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

  // Split sensors per-input: mouse uses a small distance threshold so
  // desktop drag stays snappy, touch uses a brief hold so a scroll
  // swipe doesn't immediately pick a feed up. See feed-list-dnd-sensors
  // for the rationale + the unit test that locks the values down.
  const [mouseDescriptor, touchDescriptor] = buildFeedListSensorDescriptors();
  const sensors = useSensors(
    useSensor(mouseDescriptor.sensor, mouseDescriptor.options),
    useSensor(touchDescriptor.sensor, touchDescriptor.options),
  );

  const unfiledFeeds = useMemo(() => {
    // Defensive: feeds whose folderId points at a folder that isn't on
    // this device fall through to "unfiled" instead of disappearing.
    // Two cases hit this in practice:
    //   1. A v1 cloud vault (pre-ADR-019) restored on a v2 client —
    //      feeds arrived with folderIds, folders did not.
    //   2. Any future drift between feeds.folderId and folders[].id.
    // See findOrphanedFeeds() for the matching Settings indicator.
    const folderIds = new Set(folders.map((f) => f.id));
    return feeds.filter(
      (f) => !f.folderId || !folderIds.has(f.folderId),
    );
  }, [feeds, folders]);
  const feedsByFolder = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const map = new Map<string, Feed[]>();
    for (const feed of feeds) {
      if (!feed.folderId || !folderIds.has(feed.folderId)) continue;
      const list = map.get(feed.folderId);
      if (list) list.push(feed);
      else map.set(feed.folderId, [feed]);
    }
    return map;
  }, [feeds, folders]);
  /**
   * Folder children index keyed by parentId. Top-level folders (no
   * parent) live under the empty-string key. Built from the full
   * folders list — OPML imports preserve nested structure via
   * `Folder.parentId`, and we render that as a tree below.
   */
  const childFoldersByParent = useMemo(() => {
    const map = new Map<string, typeof folders>();
    const validIds = new Set(folders.map((f) => f.id));
    for (const f of folders) {
      // An orphaned parent reference (folder whose parentId points at a
      // folder that isn't on this device) falls through to top-level
      // instead of vanishing — same defensive principle as unfiledFeeds.
      const key = f.parentId && validIds.has(f.parentId) ? f.parentId : "";
      const list = map.get(key);
      if (list) list.push(f);
      else map.set(key, [f]);
    }
    return map;
  }, [folders]);

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

  /**
   * Top-level folders only — child folders are rendered recursively
   * inside their parent's collapsible. DnD reordering currently
   * operates on this top-level slice; nested-folder reorder is a
   * follow-up (move-via-menu still works through `moveFolderToParent`).
   */
  const topLevelFolders = useMemo(
    () => childFoldersByParent.get("") ?? [],
    [childFoldersByParent],
  );

  const sortedFolders = useMemo(() => {
    if (feedSortMode === "count") {
      return [...topLevelFolders].sort((a, b) => {
        const aFeeds = feedsByFolder.get(a.id) ?? [];
        const bFeeds = feedsByFolder.get(b.id) ?? [];
        const aCount = aFeeds.reduce((sum, f) => sum + selectUnreadCount({ articlesByFeedId }, f.id), 0);
        const bCount = bFeeds.reduce((sum, f) => sum + selectUnreadCount({ articlesByFeedId }, f.id), 0);
        return bCount - aCount;
      });
    }
    if (feedSortMode === "custom") {
      return applyCustomOrder(topLevelFolders, folderCustomOrder);
    }
    return topLevelFolders;
  }, [topLevelFolders, feedSortMode, folderCustomOrder, feedsByFolder, articlesByFeedId]);

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
              />
            ))}
          </UnfiledDropZone>
        </SortableContext>

        <SortableContext items={folderSortableIds} strategy={verticalListSortingStrategy}>
          {sortedFolders.map((folder) =>
            renderFolderNode(folder, {
              childFoldersByParent,
              feedsByFolder,
              feedSortMode,
              articlesByFeedId,
              selectedFeedId,
              onFeedSelect,
              isCustomMode,
            }),
          )}
        </SortableContext>

        <DragOverlay>
          {activeDragId ? (
            <div className="rounded-md bg-card border shadow-lg px-3 py-1.5 text-sm">
              {feeds.find((f) => f.id === activeDragId)?.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!hideNewFolderInput && (
        <>
          <SidebarSeparator className="mx-0 my-1" />
          <NewFolderInput trailing={<AutoOrganizePill />} />
        </>
      )}

    </>
  );
}

interface RenderCtx {
  childFoldersByParent: Map<string, import("@feedzero/core/types").Folder[]>;
  feedsByFolder: Map<string, Feed[]>;
  feedSortMode: string;
  articlesByFeedId: Record<string, import("@feedzero/core/types").Article[]>;
  selectedFeedId: string | null;
  onFeedSelect: (feedId: string) => void;
  isCustomMode: boolean;
}

/**
 * Recursively render a folder + its descendants. Nested folders
 * (preserved through OPML import via `Folder.parentId`) render inside
 * the parent's collapsible, indented one level per depth via the
 * native shadcn FolderItem layout. DnD reorder only applies at the
 * top level for now; nested-folder reorder lands in a follow-up.
 */
function renderFolderNode(
  folder: import("@feedzero/core/types").Folder,
  ctx: RenderCtx,
) {
  const folderFeeds = ctx.feedsByFolder.get(folder.id) ?? [];
  const sortedFolderFeeds =
    ctx.feedSortMode === "count"
      ? [...folderFeeds].sort(
          (a, b) =>
            selectUnreadCount({ articlesByFeedId: ctx.articlesByFeedId }, b.id) -
            selectUnreadCount({ articlesByFeedId: ctx.articlesByFeedId }, a.id),
        )
      : folderFeeds;
  const childFolders = ctx.childFoldersByParent.get(folder.id) ?? [];
  return (
    <FolderItem
      key={folder.id}
      folder={folder}
      sortable={ctx.isCustomMode}
      isSelected={ctx.selectedFeedId === toFolderFeedId(folder.id)}
      onSelect={() => ctx.onFeedSelect(toFolderFeedId(folder.id))}
    >
      {childFolders.map((child) => renderFolderNode(child, ctx))}
      {sortedFolderFeeds.map((feed) => (
        <FeedItem
          key={feed.id}
          feed={feed}
          isSelected={feed.id === ctx.selectedFeedId}
          inFolder
          onSelect={() => ctx.onFeedSelect(feed.id)}
        />
      ))}
    </FolderItem>
  );
}
