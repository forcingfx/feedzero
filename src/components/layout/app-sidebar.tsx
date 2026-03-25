import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  ChevronsUpDown,
  Cloud,
  Compass,
  Keyboard,
  Layers,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useSyncStore } from "@/stores/sync-store.ts";
import { Switch } from "@/components/ui/switch.tsx";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";
import {
  ChangelogDialog,
  APP_VERSION,
} from "@/components/layout/changelog-dialog.tsx";
import { AddFeedForm } from "@/components/feeds/add-feed-form.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import type { Feed } from "@/types/index.ts";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

function SidebarFooterMenu({ hasFeeds }: { hasFeeds: boolean }) {
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const isSyncOn = syncStatus === "synced" || syncStatus === "syncing";
  const isSyncing = syncStatus === "syncing";
  const canSync = hasFeeds;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex items-center justify-center size-8 rounded-lg bg-muted text-muted-foreground">
              <Settings className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Settings</span>
              <span className="truncate text-xs text-muted-foreground">
                {isSyncOn ? "Cloud sync on" : "Local only"}
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
          <DropdownMenuItem onSelect={() => setChangelogOpen(true)}>
            <Sparkles className="size-4" />
            <span>What&apos;s new</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquare className="size-4" />
            <span>Send feedback</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <ChangelogDialog
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
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
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);

  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isExplorePage = pathname === "/explore";
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [feedToRemove, setFeedToRemove] = useState<Feed | null>(null);

  useEffect(() => {
    const handleAddFeed = () => setAddFormOpen(true);
    document.addEventListener("feedzero:add-feed", handleAddFeed);
    return () =>
      document.removeEventListener("feedzero:add-feed", handleAddFeed);
  }, []);

  function handleSelect(feedId: string) {
    if (isMobile) setOpenMobile(false);
    if (onFeedSelect) onFeedSelect(feedId);
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
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700">
                  v{APP_VERSION}
                </span>
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
                      Refresh <Kbd className="ml-1">R</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Popover open={addFormOpen} onOpenChange={setAddFormOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Plus className="size-4" />
                          <span className="sr-only">Add Feed</span>
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    {!addFormOpen && (
                      <TooltipContent hidden={isMobile}>
                        Add Feed <Kbd className="ml-1">N</Kbd>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <PopoverContent align="start" variant="form" className="w-80">
                    <AddFeedForm
                      onAdded={() => {
                        setAddFormOpen(false);
                        // Move focus away from the trigger button so the
                        // tooltip doesn't activate on popover close.
                        requestAnimationFrame(() => {
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                        });
                      }}
                      onCancel={() => setAddFormOpen(false)}
                      onFeedSelect={onFeedSelect}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Discover</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isExplorePage}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                      navigate("/explore");
                    }}
                    tooltip="Explore feeds"
                  >
                    <Compass className="size-4" />
                    <span>Explore feeds</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {feeds.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Feeds</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
                  {feeds.map((feed) => (
                    <SidebarMenuItem key={feed.id}>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover>
                            <MoreHorizontal />
                            <span className="sr-only">More</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem
                            onClick={() => refreshSingleFeed(feed.id)}
                          >
                            <RefreshCw className="size-4" />
                            Refresh
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
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <LocalStorageWarning />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarFooterMenu hasFeeds={feeds.length > 0} />
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
    </>
  );
}
