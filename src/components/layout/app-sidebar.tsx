import { useState, useEffect } from "react";
import { Layers, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
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
} from "@/components/ui/sidebar.tsx";
import { SyncStatusChip } from "@/components/sync/sync-status-chip.tsx";
import { AddFeedForm } from "@/components/feeds/add-feed-form.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import type { Feed } from "@/types/index.ts";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);

  const [addFormOpen, setAddFormOpen] = useState(false);
  const [feedToRemove, setFeedToRemove] = useState<Feed | null>(null);

  useEffect(() => {
    const handleAddFeed = () => setAddFormOpen(true);
    document.addEventListener("feedzero:add-feed", handleAddFeed);
    return () =>
      document.removeEventListener("feedzero:add-feed", handleAddFeed);
  }, []);

  function handleSelect(feedId: string) {
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
                    <TooltipContent>
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
                      <TooltipContent>
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
          {feeds.length > 0 && (
            <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground font-mono">
              {feeds.length > 1 && (
                <>
                  <span className="flex items-center gap-2">
                    <Kbd>U</Kbd> previous feed
                  </span>
                  <span className="flex items-center gap-2">
                    <Kbd>I</Kbd> next feed
                  </span>
                </>
              )}
              <span className="flex items-center gap-2">
                <Kbd>J</Kbd> next article
              </span>
              <span className="flex items-center gap-2">
                <Kbd>K</Kbd> previous article
              </span>
            </div>
          )}
          <SyncStatusChip />
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
