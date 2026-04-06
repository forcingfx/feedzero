import { useState, useMemo } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useFeedStore } from "@/stores/feed-store.ts";
import { SidebarSeparator } from "@/components/ui/sidebar.tsx";
import { FeedItem } from "./feed-item.tsx";
import { FolderItem } from "./folder-item.tsx";
import { NewFolderInput } from "./new-folder-input.tsx";
import { FeedRemoveDialog } from "./feed-remove-dialog.tsx";
import { FeedReloadDialog } from "./feed-reload-dialog.tsx";
import { FolderDeleteDialog } from "./folder-delete-dialog.tsx";
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

export function SidebarFeedList({ onFeedSelect }: SidebarFeedListProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const feedId = active.id as string;
    const targetFolderId = over.id === "unfiled" ? null : (over.id as string);
    moveFeedToFolder(feedId, targetFolderId);
  }

  const removeFeed = useFeedStore((s) => s.removeFeed);
  const reloadSingleFeed = useFeedStore((s) => s.reloadSingleFeed);
  const deleteFolder = useFeedStore((s) => s.deleteFolder);

  return (
    <>
      <DndContext sensors={sensors} onDragStart={(e) => setActiveDragId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <UnfiledDropZone>
          {unfiledFeeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              isSelected={feed.id === selectedFeedId}
              onSelect={() => onFeedSelect(feed.id)}
              onRemove={() => setFeedToRemove(feed)}
              onReload={() => setFeedToReload(feed)}
            />
          ))}
        </UnfiledDropZone>
        {folders.map((folder) => {
          const folderFeeds = feedsByFolder.get(folder.id) ?? [];
          return (
            <FolderItem key={folder.id} folder={folder} onDelete={() => setFolderToDelete(folder)}>
              {folderFeeds.map((feed) => (
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
        <DragOverlay>
          {activeDragId ? (
            <div className="rounded-md bg-card border shadow-lg px-3 py-1.5 text-sm">
              {feeds.find((f) => f.id === activeDragId)?.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <SidebarSeparator className="mx-0 my-1" />
      <NewFolderInput />

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
