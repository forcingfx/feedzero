import { useState } from "react";
import { Rss, X } from "lucide-react";
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
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar.tsx";
import { AddFeedForm } from "@/components/feeds/add-feed-form.tsx";
import type { Feed } from "@/types/index.ts";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const refreshAll = useFeedStore((s) => s.refreshAll);

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
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Rss className="size-5" />
          <span className="font-semibold text-base">FeedZero</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <AddFeedForm />

            <div className="px-2 py-1">
              <Button
                variant="outline"
                size="xs"
                title="Refresh all feeds"
                onClick={refreshAll}
              >
                Refresh All
              </Button>
            </div>

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
                    >
                      <span className="truncate">{feed.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      className="text-destructive hover:text-destructive"
                      aria-label={`Remove ${feed.title}`}
                      onClick={() => setFeedToRemove(feed)}
                    >
                      <X className="size-3" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />

      <AlertDialog
        open={feedToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToRemove(null);
        }}
      >
        <AlertDialogContent size="sm">
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
    </Sidebar>
  );
}
