import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import { ChevronRight, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
} from "@/components/ui/sidebar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { Folder } from "@/types/index.ts";
import { FOLDER_COLORS } from "@/lib/folder-colors.ts";

interface FolderItemProps {
  folder: Folder;
  children: React.ReactNode;
  onDelete: () => void;
  /** Whether this folder's aggregated feed is the currently selected feed. */
  isSelected: boolean;
  /** Called when the user wants to view the folder's aggregated feed. */
  onSelect: () => void;
  /** When true, the folder header shows a grip handle and is reorderable
   *  via @dnd-kit/sortable. Used in custom sort mode. */
  sortable?: boolean;
}

export function FolderItem({ folder, children, onDelete, isSelected, onSelect, sortable = false }: FolderItemProps) {
  const open = useFeedStore((s) => s.folderOpenState[folder.id] ?? true);
  const setFolderOpen = useFeedStore((s) => s.setFolderOpen);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameFolder = useFeedStore((s) => s.renameFolder);
  const updateFolderColor = useFeedStore((s) => s.updateFolderColor);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: folder.id });
  const sortableHook = useSortable({ id: folder.id, disabled: !sortable });
  const sortStyle: React.CSSProperties = sortable && sortableHook.transform
    ? { transform: CSS.Transform.toString(sortableHook.transform), transition: sortableHook.transition }
    : {};

  /** Combine the droppable ref (feed→folder drop target) with the sortable
   *  ref (folder reorder) into a single ref callback for the outer <li>. */
  function setNodeRef(node: HTMLLIElement | null) {
    setDropRef(node);
    if (sortable) sortableHook.setNodeRef(node);
  }

  function handleStartRename() {
    setRenameValue(folder.name);
    setIsRenaming(true);
  }

  function handleSubmitRename(e: React.FormEvent) {
    e.preventDefault();
    if (renameValue.trim()) renameFolder(folder.id, renameValue.trim());
    setIsRenaming(false);
  }

  const colorStyle = folder.color
    ? { backgroundColor: folder.color, color: "#ffffff" }
    : undefined;

  // The outer <li> carries no `group/menu-item` class of its own, so hovering
  // a child feed (which lives inside an inner <ul>) does NOT trigger hover
  // state on the folder header's group. The folder header is a nested <div>
  // that owns its own `group/menu-item` scope for the action-dots swap,
  // scoped only to the header row — not to child feeds.
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
        <div
          data-sidebar="menu-item"
          className="group/menu-item relative"
        >
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
          {isRenaming ? (
            <form className="flex items-center gap-2 px-2 py-1" onSubmit={handleSubmitRename}>
              <ChevronRight className="size-3.5" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary min-w-0"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => setIsRenaming(false)}
                onKeyDown={(e) => { if (e.key === "Escape") setIsRenaming(false); }}
              />
            </form>
          ) : (
            <>
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
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover className="focus-visible:ring-0">
                <MoreHorizontal />
                <span className="sr-only">Folder options</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={handleStartRename}>
                <Pencil className="size-4" /> Rename folder
              </DropdownMenuItem>
              <div data-testid="folder-color-picker" className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground mb-1.5">Color</p>
                <div className="flex gap-1 flex-wrap">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="size-5 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-offset-1"
                      style={{
                        backgroundColor: c,
                        borderColor: folder.color === c ? "#fff" : "transparent",
                        outline: folder.color === c ? `2px solid ${c}` : undefined,
                      }}
                      aria-label={`Set folder color ${c}`}
                      onClick={() => updateFolderColor(folder.id, folder.color === c ? undefined : c)}
                    />
                  ))}
                </div>
              </div>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Collapsible.Content>
          <SidebarMenu>
            {children}
          </SidebarMenu>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
}
