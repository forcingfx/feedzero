import { cn } from "@/lib/utils.ts";
import { ChevronRight, GripVertical } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar.tsx";
import type { Folder } from "@/types/index.ts";

interface FolderItemProps {
  folder: Folder;
  children: React.ReactNode;
  /** Whether this folder's aggregated feed is the currently selected feed. */
  isSelected: boolean;
  /** Called when the user wants to view the folder's aggregated feed. */
  onSelect: () => void;
  /** When true, the folder header shows a grip handle and is reorderable
   *  via @dnd-kit/sortable. Used in custom sort mode. */
  sortable?: boolean;
}

/**
 * Sidebar folder row. Select-only — rename / color / delete now live
 * in FolderSettingsDialog, opened from the floating cog above the
 * article list. The row keeps the chevron, name, color background,
 * drag handle for reorder, and the inline grouping of child feeds.
 */
export function FolderItem({
  folder,
  children,
  isSelected,
  onSelect,
  sortable = false,
}: FolderItemProps) {
  const open = useFeedStore((s) => s.folderOpenState[folder.id] ?? true);
  const setFolderOpen = useFeedStore((s) => s.setFolderOpen);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: folder.id });
  const sortableHook = useSortable({ id: folder.id, disabled: !sortable });
  const sortStyle: React.CSSProperties =
    sortable && sortableHook.transform
      ? { transform: CSS.Transform.toString(sortableHook.transform), transition: sortableHook.transition }
      : {};

  function setNodeRef(node: HTMLLIElement | null) {
    setDropRef(node);
    if (sortable) sortableHook.setNodeRef(node);
  }

  const colorStyle = folder.color
    ? { backgroundColor: folder.color, color: "#ffffff" }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      style={{ opacity: sortable && sortableHook.isDragging ? 0.4 : 1, ...sortStyle }}
      className={isOver ? "bg-accent/50 rounded-md transition-colors" : "transition-colors"}
    >
      <Collapsible.Root
        className="group/folder"
        open={open}
        onOpenChange={(v) => setFolderOpen(folder.id, v)}
      >
        <div data-sidebar="menu-item" className="group/menu-item relative">
          {sortable && (
            <button
              type="button"
              {...sortableHook.listeners}
              {...sortableHook.attributes}
              aria-label={`Drag folder ${folder.name}`}
              className="absolute -left-2 top-1.5 z-20 flex size-5 items-center justify-center cursor-grab opacity-0 group-hover/menu-item:opacity-100 transition-opacity"
            >
              <GripVertical className="size-3 text-muted-foreground" />
            </button>
          )}
          {/*
            Click the folder name → navigate to the folder's aggregated
            feed only. Click the absolutely-positioned chevron (the
            Collapsible.Trigger below) → toggle collapse only. The two
            affordances are intentionally distinct: clicking the name
            used to also toggle, which surprised users who expected
            "click name = open that feed" without losing their place
            in the folder tree. Button padding (pl-7) leaves room for
            the chevron.
          */}
          <SidebarMenuButton
            isActive={isSelected}
            onClick={onSelect}
            className="font-semibold pl-7"
            style={colorStyle}
          >
            <span className="truncate">{folder.name}</span>
          </SidebarMenuButton>
          <Collapsible.Trigger asChild>
            <button
              type="button"
              aria-label="Toggle folder"
              className={cn(
                "absolute left-1 top-1 size-6 flex items-center justify-center z-10 transition-colors",
                folder.color
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/folder:rotate-90" />
            </button>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content>
          <SidebarMenu>{children}</SidebarMenu>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
}
