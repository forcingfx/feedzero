import { useNavigate, useLocation } from "react-router";
import { Compass, Layers, Sparkles } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar.tsx";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";

interface SidebarBodyProps {
  onFeedSelect: (feedId: string) => void;
  /** Optional surface-specific action to run before navigating to /explore
   * (e.g. close the mobile drawer or the offcanvas sidebar). */
  onBeforeNavigate?: () => void;
}

/**
 * The shared navigation body used by both the desktop sidebar and the mobile
 * bottom drawer: an Explore entry, an "All items" entry (when feeds exist),
 * and the full feed/folder list. Owning this in one place keeps the two
 * surfaces from drifting apart.
 */
export function SidebarBody({ onFeedSelect, onBeforeNavigate }: SidebarBodyProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const isExplorePage = pathname === "/explore";
  const isSignalPage = pathname === "/signal";

  function handleExplore() {
    onBeforeNavigate?.();
    navigate("/explore");
  }

  function handleSignal() {
    onBeforeNavigate?.();
    navigate("/signal");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isExplorePage}
          onClick={handleExplore}
          tooltip="Explore"
        >
          <Compass className="size-4" />
          <span>Explore</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSignalPage}
          onClick={handleSignal}
          tooltip="Signal"
        >
          <Sparkles className="size-4" />
          <span>Signal</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {feeds.length > 0 && (
        <>
          <SidebarMenuItem key="all-items">
            <SidebarMenuButton
              isActive={selectedFeedId === ALL_FEEDS_ID}
              onClick={() => onFeedSelect(ALL_FEEDS_ID)}
              tooltip="All items"
            >
              <Layers className="size-4" />
              <span>All items</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarSeparator className="mx-0 my-1" />
          <SidebarFeedList onFeedSelect={onFeedSelect} />
        </>
      )}
    </SidebarMenu>
  );
}
