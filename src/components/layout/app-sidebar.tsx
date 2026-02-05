import { useState, useEffect } from "react";
import { Layers, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
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
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible.tsx";
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
            <span className="text-lg font-semibold tracking-tight">
              FeedZero
            </span>
            <div className={feeds.length > 0 ? "grid grid-cols-2 gap-2" : ""}>
              {feeds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRefreshingAll}
                  onClick={refreshAll}
                  className="min-w-0 font-mono text-xs"
                >
                  <span className="truncate">
                    {isRefreshingAll ? "Refreshing…" : "Refresh"}
                  </span>
                  {!isRefreshingAll && (
                    <Kbd className="ml-auto shrink-0">R</Kbd>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddFormOpen(!addFormOpen)}
                className="min-w-0 font-mono text-xs"
              >
                <span className="truncate">Add Feed</span>
                <Kbd className="ml-auto shrink-0">N</Kbd>
              </Button>
            </div>
            {(feeds.length > 1 || feeds.length > 0) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                {feeds.length > 1 && (
                  <span className="flex items-center gap-1">
                    <Kbd>U</Kbd>
                    <Kbd>I</Kbd> feeds
                  </span>
                )}
                {feeds.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Kbd>J</Kbd>
                    <Kbd>K</Kbd> articles
                  </span>
                )}
              </div>
            )}
          </div>

          <Collapsible open={addFormOpen}>
            <CollapsibleContent>
              <AddFeedForm
                onAdded={() => setAddFormOpen(false)}
                onCancel={() => setAddFormOpen(false)}
                onFeedSelect={onFeedSelect}
              />
            </CollapsibleContent>
          </Collapsible>
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
