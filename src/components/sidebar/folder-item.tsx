import { useState } from "react";
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useDroppable } from "@dnd-kit/core";
import { useFeedStore } from "@/stores/feed-store.ts";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { Folder } from "@/types/index.ts";

interface FolderItemProps {
  folder: Folder;
  children: React.ReactNode;
  onDelete: () => void;
}

export function FolderItem({ folder, children, onDelete }: FolderItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameFolder = useFeedStore((s) => s.renameFolder);
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

  return (
    <div ref={setNodeRef} className={isOver ? "bg-accent/50 rounded-md transition-colors" : "transition-colors"}>
      <SidebarMenuItem>
        <Collapsible.Root className="group/folder" defaultOpen>
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
            <Collapsible.Trigger asChild>
              <SidebarMenuButton className="font-medium">
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/folder:rotate-90" />
                <span className="truncate">{folder.name}</span>
              </SidebarMenuButton>
            </Collapsible.Trigger>
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
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Collapsible.Content>
            {children}
          </Collapsible.Content>
        </Collapsible.Root>
      </SidebarMenuItem>
    </div>
  );
}
