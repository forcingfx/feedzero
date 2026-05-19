import { Filter, MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { SmartFilter } from "@/types/index.ts";

interface SmartFilterItemProps {
  filter: SmartFilter;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Sidebar row for a single smart filter. Click selects the filter view;
 * the "…" menu opens edit / duplicate / delete. The store handles the
 * gate-locked path on its own — every menu action goes through it.
 */
export function SmartFilterItem({
  filter,
  isSelected,
  onSelect,
}: SmartFilterItemProps) {
  const openEditor = useSmartFilterStore((s) => s.openEditor);
  const duplicateFilter = useSmartFilterStore((s) => s.duplicateFilter);
  const removeFilter = useSmartFilterStore((s) => s.removeFilter);

  return (
    <SidebarMenuItem data-testid="sidebar-smart-filter-item">
      <SidebarMenuButton
        isActive={isSelected}
        onClick={onSelect}
        tooltip={filter.name}
      >
        <Filter className="size-4 text-violet-500" />
        <span className="truncate">{filter.name}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            data-testid={`smart-filter-menu-${filter.id}`}
            aria-label="Filter actions"
          >
            <MoreHorizontal className="size-3.5" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36">
          <DropdownMenuItem onClick={() => openEditor(filter)}>
            <Pencil className="size-3.5 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicateFilter(filter.id)}>
            <Copy className="size-3.5 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => removeFilter(filter.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
