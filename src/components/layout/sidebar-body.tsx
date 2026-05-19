import { useNavigate, useLocation } from "react-router";
import { Compass, Layers, Star } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { ALL_FEEDS_ID, STARRED_FEED_ID } from "@/utils/constants.ts";
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
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const isExplorePage = pathname === "/explore";

  // Show "Starred" once the user has actually starred something; before
  // that, the entry would land on an empty view and feels like clutter.
  // The article-store buckets are the source of truth, so the entry
  // appears as soon as toggleStar runs — no extra plumbing required.
  const hasStarredArticles = Object.values(articlesByFeedId).some((list) =>
    list.some((a) => a.starred),
  );

  function handleExplore() {
    onBeforeNavigate?.();
    navigate("/explore");
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
          {hasStarredArticles && (
            <SidebarMenuItem key="starred">
              <SidebarMenuButton
                isActive={selectedFeedId === STARRED_FEED_ID}
                onClick={() => onFeedSelect(STARRED_FEED_ID)}
                tooltip="Starred"
                data-testid="sidebar-starred-link"
              >
                <Star className="size-4 text-amber-500" />
                <span>Starred</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarSeparator className="mx-0 my-1" />
          <SidebarFeedList onFeedSelect={onFeedSelect} />
        </>
      )}
    </SidebarMenu>
  );
}
