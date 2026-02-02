import { useState } from "react";
import { MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
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
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-lg font-semibold tracking-tight">
              FeedZero
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Refresh all feeds"
                disabled={isRefreshingAll}
                onClick={refreshAll}
              >
                <RefreshCw
                  className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title={addFormOpen ? "Cancel" : "Add feed"}
                onClick={() => setAddFormOpen(!addFormOpen)}
              >
                <Plus
                  className="size-4 transition-transform duration-200"
                  style={{
                    transform: addFormOpen ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                />
              </Button>
            </div>
          </div>

          <Collapsible open={addFormOpen}>
            <CollapsibleContent>
              <AddFeedForm onAdded={() => setAddFormOpen(false)} />
            </CollapsibleContent>
          </Collapsible>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              {feeds.length === 0 ? (
                <div className="px-2 py-4 text-muted-foreground text-sm">
                  No feeds yet. Add one above.
                </div>
              ) : (
                <SidebarMenu>
                  {feeds.map((feed) => (
                    <SidebarMenuItem key={feed.id}>
                      <SidebarMenuButton
                        isActive={feed.id === selectedFeedId}
                        onClick={() => handleSelect(feed.id)}
                        tooltip={feed.title}
                        className="font-semibold py-2 group-has-data-[state=open]/menu-item:bg-sidebar-accent"
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
              )}
            </SidebarGroupContent>
          </SidebarGroup>
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
