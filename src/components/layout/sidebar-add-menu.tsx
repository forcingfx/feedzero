import { useRef } from "react";
import { useNavigate } from "react-router";
import { Filter, FolderPlus, Plus, Rss } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";

/**
 * The sidebar's one "create" entry point: a "+" icon in the header that
 * opens a menu with Add feed, New folder and New filter. Replaces two
 * create rows that sat inside the navigation list and read as places to
 * go rather than things to do (audit 2026-Q4, round 2, rule 3).
 *
 * "New filter" stays visible to free users and routes to the upgrade
 * page instead of opening an editor they cannot save from (ADR 012).
 */
export function SidebarAddMenu() {
  const navigate = useNavigate();
  const openFolderCreator = useFeedStore((s) => s.openFolderCreator);
  const hasFeeds = useFeedStore((s) => s.feeds.length > 0);
  const openFilterEditor = useSmartFilterStore((s) => s.openEditor);
  const filtersGate = useFeatureGate("filters");
  // The folder input autofocuses and cancels on blur. While the menu is
  // open its focus trap pulls focus straight back, and on close Radix
  // returns focus to the "+" trigger; either blur would close the input in
  // the same tick. So the creator opens from the close hook, after the trap
  // is gone and with the focus return suppressed.
  const openCreatorAfterClose = useRef(false);

  function handleNewFilter() {
    if (!filtersGate.enabled) {
      filtersGate.promptUpgrade();
      return;
    }
    openFilterEditor(null);
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Add">
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Add</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-40"
        onCloseAutoFocus={(event) => {
          if (!openCreatorAfterClose.current) return;
          openCreatorAfterClose.current = false;
          event.preventDefault();
          openFolderCreator();
        }}
      >
        <DropdownMenuItem onClick={() => navigate("/explore")}>
          <Rss className="size-4" />
          Add feed…
        </DropdownMenuItem>
        {/* No feeds means no list to put a folder in; the item stays visible so the feature is discoverable. */}
        <DropdownMenuItem disabled={!hasFeeds} onClick={() => { openCreatorAfterClose.current = true; }}>
          <FolderPlus className="size-4" />
          New folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleNewFilter} data-testid="sidebar-new-filter">
          <Filter className="size-4" />
          New filter{filtersGate.enabled ? "" : "…"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
