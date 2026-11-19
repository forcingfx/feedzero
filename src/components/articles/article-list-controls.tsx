import { CheckCheck,
  Layers,
  PanelLeft,
  PanelLeftClose,
  Star,
  Filter,
  Folder as FolderIcon,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { markAllReadWithUndo } from "@/lib/mark-all-read-with-undo.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useOptionalSidebar } from "@/components/ui/sidebar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { HeaderAction } from "./header-action.tsx";
import { SortPill } from "./sort-pill.tsx";
import { SettingsPill } from "./settings-pill.tsx";
import { ViewOptionsPill } from "./view-options-pill.tsx";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  isFolderFeedId,
  fromFolderFeedId,
  isFilterFeedId,
  fromFilterFeedId,
} from "@feedzero/core/utils/constants";
import type { ArticleSortMode } from "@feedzero/core/types";
import { MOBILE_LIST_TITLE_PX } from "@/components/layout/mobile-chrome.ts";

interface ArticleListControlsProps {
  sortMode: ArticleSortMode;
  onSortChange: (mode: ArticleSortMode) => void;
}

/**
 * Sticky title bar at the top of the article-list panel. Shows the
 * current feed indicator on the left and the icon actions (mark read,
 * settings, sort) on the right, all ghost icon buttons with tooltips.
 *
 * On a phone this renders the list's title instead: the actions live in
 * the floating view pill (`MobileViewPill`, mounted by `app-layout.tsx`).
 */
export function ArticleListControls({
  sortMode,
  onSortChange,
}: ArticleListControlsProps) {
  // The same breakpoint the shell switches on. A separate 768px check
  // here used to leave tablets with both the phone header and this bar.
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <MobileListTitle />;

  return (
    <div
      data-testid="article-list-controls"
      className="sticky top-0 z-10 flex items-center gap-2 px-3 h-12 border-b bg-background/80 backdrop-blur-sm"
    >
      <SidebarCollapseButton />
      <FeedIndicator />
      <div className="ml-auto flex items-center gap-2 pointer-events-auto">
        <MarkAllReadButton />
        <SettingsPill />
        <SortPill mode={sortMode} onChange={onSortChange} />
      </div>
    </div>
  );
}

/**
 * Visible counterpart to the `[` shortcut: collapses the feed list to
 * reclaim its width, expands it again. Sits at the left of the title bar,
 * over the column it acts on.
 *
 * Renders nothing when there is no sidebar context. That is a real app
 * state rather than a missing wrapper — SidebarProvider is mounted only in
 * the desktop shell, and offering to collapse a sidebar that does not
 * exist would be a dead control.
 */
function SidebarCollapseButton() {
  const sidebar = useOptionalSidebar();
  if (!sidebar) return null;
  const { open, toggleSidebar } = sidebar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Hide feed list" : "Show feed list"}
          aria-expanded={open}
          onClick={toggleSidebar}
        >
          {open ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeft className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {open ? "Hide feed list" : "Show feed list"} <Kbd>[</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Inline feed indicator — icon + truncated name for whichever view
 * is selected. Resolves virtual feeds (All items, Starred, folders, filters)
 * but drops the article slot (the article-list view is already
 * showing the articles; surfacing one in a breadcrumb here would
 * duplicate context with the reader panel).
 */
interface ViewLabel {
  icon: React.ReactNode;
  name: string;
}

/** Icon and name of the view the article list is showing, or null before one is selected. */
function useViewLabel(): ViewLabel | null {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const smartFilters = useSmartFilterStore((s) => s.filters);

  if (!selectedFeedId) return null;
  if (selectedFeedId === ALL_FEEDS_ID) {
    return { icon: <Layers className="size-4 shrink-0" />, name: "All items" };
  }
  if (selectedFeedId === STARRED_FEED_ID) {
    return { icon: <Star className="size-4 shrink-0 text-warning" />, name: "Starred" };
  }
  if (isFolderFeedId(selectedFeedId)) {
    const folder = folders.find((f) => f.id === fromFolderFeedId(selectedFeedId));
    return {
      icon: <FolderIcon className="size-4 shrink-0 text-primary" />,
      name: folder?.name ?? "Folder",
    };
  }
  if (isFilterFeedId(selectedFeedId)) {
    const filter = smartFilters.find((f) => f.id === fromFilterFeedId(selectedFeedId));
    return {
      icon: <Filter className="size-4 shrink-0 text-primary" />,
      name: filter?.name ?? "Filter",
    };
  }
  const feed = feeds.find((f) => f.id === selectedFeedId);
  if (!feed) return null;
  return {
    icon: <FeedFavicon siteUrl={feed.siteUrl} className="size-4 shrink-0" />,
    name: feed.title,
  };
}

function FeedIndicator() {
  const view = useViewLabel();
  if (!view) return <span className="text-sm font-medium" />;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
      {view.icon}
      <span className="truncate">{view.name}</span>
    </div>
  );
}

/**
 * The phone list's title: the view's name large, its unread count under
 * it, scrolling away with the rows. It took over from the header bar's
 * breadcrumb, which spent a pinned row on the same name. A fixed height,
 * because the list's virtualizer positions rows below it; the right
 * padding keeps the name clear of the floating view pill.
 */
function MobileListTitle() {
  const view = useViewLabel();
  const unread = useUnreadCount();
  return (
    <div
      data-testid="mobile-list-title"
      className="flex flex-col justify-center pl-4 pr-16"
      style={{ height: MOBILE_LIST_TITLE_PX }}
    >
      <h1 className="truncate text-xl font-semibold tracking-tight">{view?.name ?? "Articles"}</h1>
      <p className="text-sm text-muted-foreground">
        {unread > 0 ? `${unread} unread` : "All read"}
      </p>
    </div>
  );
}

/**
 * The phone's one floating control over the feed list: a glass pill at
 * the top right holding the view's options (sort, mark read, and the
 * feed, folder or filter settings). Refresh is the pull-to-refresh
 * gesture's job, plus "Refresh all" in the drawer footer.
 */
export function MobileViewPill() {
  return (
    <div
      data-testid="mobile-view-pill"
      className="liquid-glass absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+0.5rem)] z-10 rounded-full"
    >
      <ViewOptionsPill />
    </div>
  );
}

/** Unread articles in the current view; the sweep below marks them all. */
export function useUnreadCount(): number {
  return useArticleStore((s) => s.articles.reduce((n, a) => n + (a.read ? 0 : 1), 0));
}

/**
 * "Mark N read" as a title-bar action. It used to float over the list and
 * covered the last visible row (audit 2026-Q4, finding 4). The sweep is
 * undoable from its toast, so no confirmation is asked.
 */
function MarkAllReadButton() {
  const unread = useUnreadCount();
  if (unread === 0) return null;
  const label = `Mark ${unread} read`;
  return (
    <HeaderAction label={label} data-testid="mark-all-read" onClick={() => void markAllReadWithUndo()}>
      <CheckCheck className="size-4" />
    </HeaderAction>
  );
}
