import { useNavigate, useLocation } from "react-router";
import { Compass, Layers, Sparkles, Star, Plus } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useBriefingStore } from "@/stores/briefing-store.ts";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFilterFeedId,
} from "@feedzero/core/utils/constants";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar.tsx";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";
import { SmartFilterItem } from "@/components/sidebar/smart-filter-item.tsx";

interface SidebarBodyProps {
  onFeedSelect: (feedId: string) => void;
  /** Optional surface-specific action to run before navigating to /explore
   * (e.g. close the mobile drawer or the offcanvas sidebar). */
  onBeforeNavigate?: () => void;
  /**
   * Suppress the inline "New folder" affordance at the bottom of the
   * feed list. The mobile drawer sets this so it can render its own
   * always-reachable copy in the pinned footer.
   */
  hideNewFolderInput?: boolean;
}

/**
 * The shared navigation body used by both the desktop sidebar and the mobile
 * bottom drawer: an Explore entry, an "All items" entry (when feeds exist),
 * and the full feed/folder list. Owning this in one place keeps the two
 * surfaces from drifting apart.
 */
export function SidebarBody({
  onFeedSelect,
  onBeforeNavigate,
  hideNewFolderInput,
}: SidebarBodyProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const smartFilters = useSmartFilterStore((s) => s.filters);
  const openFilterEditor = useSmartFilterStore((s) => s.openEditor);
  const filtersGate = useFeatureGate("filters");
  const briefings = useBriefingStore((s) => s.briefings);
  const isExplorePage = pathname === "/explore";
  // /signal AND /signal/briefings both light up the Signal entry since
  // Briefings is a sub-tab of Signal now.
  const isSignalPage = pathname === "/signal" || pathname.startsWith("/signal/");

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

  function handleSignal() {
    onBeforeNavigate?.();
    navigate("/signal");
  }

  // Stale dot on the Signal entry when any briefing (sub-tab of
  // Signal) has unconsumed new matching articles.
  const briefingsStaleCount = briefings.reduce(
    (n, b) => n + (b.staleArticleCount > 0 ? 1 : 0),
    0,
  );

  // Honor-system open-core: the Filters section stays visible to free
  // users so the feature is discoverable. Clicking "New filter" while
  // gate-locked routes to the Subscription tab instead of opening an
  // editor the user can't save from. Self-hosters and the pre-launch
  // build relax the gate at `feature-gates.ts` and reach `openEditor`
  // directly. See ADR 012 for the wider pattern.
  function handleCreateFilter() {
    if (!filtersGate.enabled) {
      filtersGate.promptUpgrade();
      return;
    }
    openFilterEditor(null);
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
          data-testid="sidebar-signal-link"
        >
          <Sparkles className="size-4" />
          <span>Signal</span>
          {briefingsStaleCount > 0 && (
            <span
              aria-label={`${briefingsStaleCount} briefing(s) have new matching articles`}
              className="ml-auto size-2 rounded-full bg-amber-500"
            />
          )}
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
          <SidebarMenuItem key="filters-header">
            <SidebarMenuButton
              onClick={handleCreateFilter}
              tooltip={
                filtersGate.enabled
                  ? "New smart filter"
                  : "Smart filters — upgrade to Personal"
              }
              data-testid="sidebar-new-filter"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
              <span>New filter</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {smartFilters.map((filter) => (
            <SmartFilterItem
              key={filter.id}
              filter={filter}
              isSelected={selectedFeedId === toFilterFeedId(filter.id)}
              onSelect={() => onFeedSelect(toFilterFeedId(filter.id))}
            />
          ))}
          <SidebarSeparator className="mx-0 my-1" />
          <SidebarFeedList
            onFeedSelect={onFeedSelect}
            hideNewFolderInput={hideNewFolderInput}
          />
        </>
      )}
    </SidebarMenu>
  );
}
