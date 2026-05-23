import { Filter } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import type { SmartFilter } from "@feedzero/core/types";

interface SmartFilterItemProps {
  filter: SmartFilter;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Sidebar row for a single smart filter. Select-only. Edit /
 * Duplicate / Delete now live in SmartFilterEditorDialog, opened
 * from the floating cog above the article list when the user is on
 * the filter's view.
 */
export function SmartFilterItem({
  filter,
  isSelected,
  onSelect,
}: SmartFilterItemProps) {
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
    </SidebarMenuItem>
  );
}
