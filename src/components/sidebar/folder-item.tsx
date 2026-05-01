import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useDroppable } from "@dnd-kit/core";
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

const FOLDER_COLORS = [
  "#7c3aed", // violet
  "#2563eb", // blue
  "#0891b2", // cyan
  "#059669", // emerald
  "#d97706", // amber
  "#dc2626", // red
  "#db2777", // pink
  "#64748b", // slate
];

interface FolderItemProps {
  folder: Folder;
  children: React.ReactNode;
  onDelete: () => void;
  /** Whether this folder's aggregated feed is the currently selected feed. */
  isSelected: boolean;
  /** Called when the user wants to view the folder's aggregated feed. */
  onSelect: () => void;
}

export function FolderItem({ folder, children, onDelete, isSelected, onSelect }: FolderItemProps) {
  const [open, setOpen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameFolder = useFeedStore((s) => s.renameFolder);
  const updateFolderColor = useFeedStore((s) => s.updateFolderColor);
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });

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
      className={isOver ? "bg-accent/50 rounded-md transition-colors" : "transition-colors"}
    >
      <Collapsible.Root className="group/folder" open={open} onOpenChange={setOpen}>
        <div
          data-sidebar="menu-item"
          className="group/menu-item relative"
        >
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
                The SidebarMenuButton does both: navigate to the folder's
                aggregated feed AND toggle collapse. The absolutely-positioned
                Collapsible.Trigger (chevron) also toggles collapse but does
                NOT navigate — useful for keyboard/pointer users who want
                collapse-only. Button padding (pl-7) leaves room for the chevron.
              */}
              <SidebarMenuButton
                isActive={isSelected}
                onClick={() => { onSelect(); setOpen(o => !o); }}
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
                    "absolute left-1 top-1 size-6 flex items-center justify-center rounded-sm z-10",
                    folder.color ? "hover:bg-white/20" : "hover:bg-sidebar-accent",
                  )}
                  style={folder.color ? { color: "#ffffff" } : undefined}
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
