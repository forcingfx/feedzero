import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  ChevronsUpDown,
  Cloud,
  Compass,
  Keyboard,
  Pencil,
  Layers,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarMenuBadge,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { Switch } from "@/components/ui/switch.tsx";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";
import { CHANGELOG_FEED_PATH } from "@/utils/constants.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsOnline } from "@/hooks/use-online.ts";
import type { Feed } from "@/types/index.ts";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const settingsShortcutLabel = isMac ? "⌘," : "Ctrl+,";

function SyncBadge({ status, isOnline }: { status: string; isOnline: boolean }) {
  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <span className="rounded-full size-1.5 bg-muted-foreground/50" />
        Offline
      </span>
    );
  }
  if (status === "synced" || status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className={`rounded-full size-1.5 bg-emerald-500 ${status === "syncing" ? "animate-pulse" : ""}`} />
        {status === "syncing" ? "Syncing" : "Synced"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="rounded-full size-1.5 bg-red-500" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      <span className="rounded-full size-1.5 bg-amber-500" />
      Local
    </span>
  );
}

function SidebarFooterMenu({ hasFeeds, onWhatsNew }: { hasFeeds: boolean; onWhatsNew: () => void }) {
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const isOnline = useIsOnline();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const handleWhatsNew = onWhatsNew;

  const isSyncOn = syncStatus === "synced" || syncStatus === "syncing";
  const isSyncing = syncStatus === "syncing";
  const canSync = hasFeeds;

  // Listen for Cmd/Ctrl+, to open settings dropdown
  useEffect(() => {
    const handler = () => setMenuOpen(true);
    document.addEventListener("feedzero:open-settings", handler);
    return () =>
      document.removeEventListener("feedzero:open-settings", handler);
  }, []);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="group/settings py-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex items-center justify-center size-8 rounded-lg bg-muted text-muted-foreground">
              <Settings className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Settings</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <SyncBadge status={syncStatus} isOnline={isOnline} />
                <Kbd className="h-4 text-[9px] px-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">{settingsShortcutLabel}</Kbd>
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          side="top"
          align="end"
          sideOffset={4}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                disabled={!canSync && !isSyncOn}
                onSelect={(e) => {
                  e.preventDefault();
                  if (canSync || isSyncOn) setSyncDialogOpen(true);
                }}
              >
                <div className="flex items-center gap-2 flex-1">
                  {isSyncing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Cloud className="size-4" />
                  )}
                  <span>Cloud sync</span>
                </div>
                <Switch
                  size="sm"
                  checked={isSyncOn}
                  disabled={!canSync && !isSyncOn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canSync || isSyncOn) setSyncDialogOpen(true);
                  }}
                />
              </DropdownMenuItem>
            </TooltipTrigger>
            {!canSync && !isSyncOn && (
              <TooltipContent side="left">
                Add a feed first to enable sync
              </TooltipContent>
            )}
          </Tooltip>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard className="size-4" />
            <span>Keyboard shortcuts</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquare className="size-4" />
            <span>Send feedback</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleWhatsNew}>
            <Sparkles className="size-4" />
            <span>What&apos;s new</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}

const LOCAL_STORAGE_WARNING_KEY = "feedzero:local-warning-dismissed";

function LocalStorageWarning() {
  const feeds = useFeedStore((s) => s.feeds);
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_WARNING_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (dismissed || feeds.length === 0 || syncStatus !== "local-only") {
    return null;
  }

  function handleDismiss() {
    try {
      localStorage.setItem(LOCAL_STORAGE_WARNING_KEY, "true");
    } catch {
      // localStorage unavailable
    }
    setDismissed(true);
  }

  return (
    <div className="mx-2 mb-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
      <div className="flex items-start justify-between gap-2">
        <p>
          Your feeds are stored locally. Clearing browser data will delete them.
        </p>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <button
        onClick={() => setSyncDialogOpen(true)}
        className="mt-1.5 underline hover:no-underline font-medium"
      >
        Enable cloud sync
      </button>
    </div>
  );
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const unreadCounts = useArticleStore((s) => s.unreadCounts);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const reloadSingleFeed = useFeedStore((s) => s.reloadSingleFeed);
  const renameFeed = useFeedStore((s) => s.renameFeed);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);

  const addFeed = useFeedStore((s) => s.addFeed);

  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isExplorePage = pathname === "/explore";
  const [feedToRemove, setFeedToRemove] = useState<Feed | null>(null);
  const [feedToReload, setFeedToReload] = useState<Feed | null>(null);
  const [renamingFeedId, setRenamingFeedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleSelect(feedId: string) {
    if (isMobile) setOpenMobile(false);
    if (onFeedSelect) onFeedSelect(feedId);
  }

  async function handleWhatsNew() {
    const existing = feeds.find((f) => f.url.includes(CHANGELOG_FEED_PATH));
    if (existing) {
      handleSelect(existing.id);
      navigate(`/feeds/${existing.id}`);
      return;
    }
    // Subscribe by fetching XML directly (same origin, no proxy needed)
    try {
      const res = await fetch(CHANGELOG_FEED_PATH);
      if (!res.ok) return;
      const xml = await res.text();
      const changelogUrl = `${window.location.origin}${CHANGELOG_FEED_PATH}`;
      await addFeed(changelogUrl, xml);
      const { feeds: updated } = useFeedStore.getState();
      const added = updated.find((f) => f.url.includes(CHANGELOG_FEED_PATH));
      if (added) {
        handleSelect(added.id);
        navigate(`/feeds/${added.id}`);
      }
    } catch { /* noop */ }
  }

  function handleConfirmRemove() {
    if (feedToRemove) {
      removeFeed(feedToRemove.id);
      setFeedToRemove(null);
    }
  }

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader>
          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold tracking-tight">
                FeedZero
              </span>
              <div className="flex items-center gap-1">
                {feeds.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isRefreshingAll}
                        onClick={refreshAll}
                        className="size-8"
                      >
                        <RefreshCw
                          className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`}
                        />
                        <span className="sr-only">Refresh</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent hidden={isMobile}>
                      Refresh <Kbd className="ml-1">r</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isExplorePage}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                      navigate("/explore");
                    }}
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
                        onClick={() => handleSelect(ALL_FEEDS_ID)}
                        tooltip="All items"
                      >
                        <Layers className="size-4" />
                        <span>All items</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarSeparator className="mx-0 my-1" />
                    {feeds.map((feed) => (
                      <SidebarMenuItem key={feed.id}>
                        {renamingFeedId === feed.id ? (
                          <form
                            className="flex items-center gap-2 px-2 py-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (renameValue.trim()) {
                                renameFeed(feed.id, renameValue.trim());
                              }
                              setRenamingFeedId(null);
                            }}
                          >
                            <FeedFavicon siteUrl={feed.siteUrl} />
                            <input
                              autoFocus
                              className="flex-1 bg-transparent text-sm outline-none border-b border-primary min-w-0"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => setRenamingFeedId(null)}
                              onKeyDown={(e) => { if (e.key === "Escape") setRenamingFeedId(null); }}
                            />
                          </form>
                        ) : (
                        <SidebarMenuButton
                          isActive={feed.id === selectedFeedId}
                          onClick={() => handleSelect(feed.id)}
                          tooltip={feed.title}
                        >
                          <FeedFavicon siteUrl={feed.siteUrl} />
                          <span className="truncate">{feed.title}</span>
                          {refreshingFeedIds.has(feed.id) && (
                            <RefreshCw className="size-3 animate-spin shrink-0 text-muted-foreground" />
                          )}
                        </SidebarMenuButton>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction showOnHover className="focus-visible:ring-0">
                              <MoreHorizontal />
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameValue(feed.title);
                                setRenamingFeedId(feed.id);
                              }}
                            >
                              <Pencil className="size-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => refreshSingleFeed(feed.id)}
                            >
                              <RefreshCw className="size-4" />
                              Refresh
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setFeedToReload(feed)}
                            >
                              <RotateCcw className="size-4" />
                              Clear cached articles
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setFeedToRemove(feed)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {!refreshingFeedIds.has(feed.id) && (unreadCounts[feed.id] ?? 0) > 0 && (
                          <SidebarMenuBadge className="rounded-lg bg-primary/10 text-primary text-[10px] font-semibold group-hover/menu-item:md:opacity-0 group-focus-within/menu-item:md:opacity-0 group-has-[[data-state=open]]/menu-item:md:opacity-0 transition-opacity">
                            {unreadCounts[feed.id] > 99 ? "99+" : unreadCounts[feed.id]}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <LocalStorageWarning />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarFooterMenu hasFeeds={feeds.length > 0} onWhatsNew={handleWhatsNew} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <AlertDialog
        open={feedToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove feed</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &ldquo;{feedToRemove?.title}&rdquo;? This will also delete
              all its articles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={feedToReload !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToReload(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear cached articles</AlertDialogTitle>
            <AlertDialogDescription>
              All articles for &ldquo;{feedToReload?.title}&rdquo; will be deleted
              and reloaded from the source. Read/unread status will be lost.
              Older articles may not be available if the feed no longer provides them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (feedToReload) {
                  reloadSingleFeed(feedToReload.id);
                  setFeedToReload(null);
                }
              }}
            >
              Clear and reload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
