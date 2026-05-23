import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronUp, Layers, RefreshCw, Settings } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import { orderFeedsByRecency, MOBILE_DOCK_FEED_CAP } from "@/lib/recent-feeds.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { SidebarMenu, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { NewFolderInput } from "@/components/sidebar/new-folder-input.tsx";
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill.tsx";
import { goToSettings } from "@/lib/go-to-settings.ts";

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);

  useEffect(() => {
    function handleToggle() {
      setOpen((o) => !o);
    }
    document.addEventListener("feedzero:toggle-sidebar", handleToggle);
    return () => document.removeEventListener("feedzero:toggle-sidebar", handleToggle);
  }, []);

  function handleSelect(feedId: string) {
    onFeedSelect(feedId);
    setOpen(false);
  }

  function handleSettings() {
    setOpen(false);
    goToSettings(navigate);
  }

  const recentFeedIds = useFeedStore((s) => s.recentFeedIds);
  // The closed strip is a quick-switch dock, not a status line: showing the
  // current feed name here just echoed the header. Instead, surface the
  // feeds the user actually hops between — All-items plus their most
  // recently viewed feeds, capped so the open-list chevron stays reachable.
  const dockFeeds = orderFeedsByRecency(feeds, recentFeedIds).slice(
    0,
    MOBILE_DOCK_FEED_CAP,
  );
  const allActive = selectedFeedId === ALL_FEEDS_ID;

  return (
    // No `snapPoints` here: with a single snap point and an inline height,
    // vaul's snap-mode adds no value but it does intercept vertical drag
    // gestures inside scrollable content. The 2026-05-19 bug report
    // (long feed list, Settings unreachable) was that interception — vaul
    // ate the touch-move before the inner scroll could process it. Default
    // mode keeps vaul's standard "scroll until top, then drag to dismiss"
    // pattern, which is exactly what we want.
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <div
        data-testid="drawer-handle-strip"
        // iOS safe-area clearance:
        //   pb-[env(safe-area-inset-bottom)] + matching h-[calc()] keeps the
        //   60px dock content area above the home indicator.
        //   pl/pr-[max(0.75rem,env(safe-area-inset-left|right))] holds a
        //   visual gutter from the rounded display corners in portrait and
        //   clears the notch/camera cutout in landscape.
        className="relative flex items-center gap-1 shrink-0 border-t bg-background pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] h-[calc(60px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-muted-foreground/30" />

        {/* Quick-switch dock: All-items + most-recently-viewed feed
            favicons. Tapping switches feeds directly (the drawer is
            already closed); the chevron opens the full list. */}
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <button
            type="button"
            aria-label="All items"
            aria-pressed={allActive}
            onClick={() => onFeedSelect(ALL_FEEDS_ID)}
            className={`flex items-center justify-center size-10 shrink-0 rounded-md ${
              allActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Layers className="size-5" />
          </button>
          {dockFeeds.map((feed) => {
            const active = feed.id === selectedFeedId;
            return (
              <button
                key={feed.id}
                type="button"
                aria-label={feed.title}
                aria-pressed={active}
                onClick={() => onFeedSelect(feed.id)}
                className={`flex items-center justify-center size-10 shrink-0 rounded-md hover:bg-accent/50 ${
                  active
                    ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                    : ""
                }`}
              >
                <FeedFavicon siteUrl={feed.siteUrl} className="size-6" />
              </button>
            );
          })}
        </div>

        <Drawer.Trigger asChild>
          <button
            type="button"
            aria-label="Open feed list"
            className="flex items-center justify-center size-10 shrink-0 rounded-md text-muted-foreground hover:bg-accent/50"
          >
            <ChevronUp
              data-testid="drawer-open-chevron"
              className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </Drawer.Trigger>
      </div>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          data-testid="drawer-content"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-xl focus:outline-none overflow-hidden"
          style={{ height: "85dvh" }}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mt-3 mb-1 shrink-0" />

          <SidebarProvider defaultOpen={false} className="flex-1 flex flex-col min-h-0">
            <div
              data-testid="drawer-scroll"
              // pb-[calc(env(safe-area-inset-bottom) + (100vh - 100dvh)):
              //   home-indicator inset + iOS Safari toolbar slack. The
              //   2rem breathing room previously lived here; now the pinned
              //   Settings footer provides that floor instead.
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)_+_(100vh_-_100dvh))]"
            >
              <div data-testid="drawer-section" className="w-full py-1 px-3">
                <SidebarBody
                  onFeedSelect={handleSelect}
                  onBeforeNavigate={() => setOpen(false)}
                  hideNewFolderInput
                />
              </div>
            </div>

            {/*
              Always-reachable footer (outside the scroll). Holds the two
              affordances a user with 50+ feeds shouldn't have to scroll
              past every row to reach: "New folder" (folder management)
              and "Settings" (app preferences). 2026-05-19 bug report
              proved the inline-at-bottom-of-scroll placement broke under
              long lists. `shrink-0` so the footer can't be squeezed.
            */}
            <div
              data-testid="drawer-section"
              className="shrink-0 border-t bg-background px-3 py-1 pb-[calc(env(safe-area-inset-bottom)_+_(100vh_-_100dvh)_+_0.25rem)]"
            >
              <SidebarMenu>
                <NewFolderInput trailing={<AutoOrganizePill />} />
              </SidebarMenu>
              {feeds.length > 0 && (
                <button
                  type="button"
                  data-testid="drawer-refresh-all"
                  onClick={() => void refreshAll()}
                  disabled={isRefreshingAll}
                  className="flex items-center gap-3 w-full px-2 py-3 text-left text-sm font-medium rounded-md hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-4 shrink-0 text-muted-foreground ${isRefreshingAll ? "animate-spin" : ""}`}
                  />
                  {isRefreshingAll ? "Refreshing…" : "Refresh all"}
                </button>
              )}
              <button
                type="button"
                onClick={handleSettings}
                className="flex items-center gap-3 w-full px-2 py-3 text-left text-sm font-medium rounded-md hover:bg-accent"
              >
                <Settings className="size-4 shrink-0 text-muted-foreground" />
                Settings
              </button>
            </div>
          </SidebarProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
