import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronUp, Layers, RefreshCw, Settings } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  isFilterFeedId,
  fromFilterFeedId,
} from "@/utils/constants.ts";
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

  const smartFilters = useSmartFilterStore((s) => s.filters);
  const activeFeed = feeds.find((f) => f.id === selectedFeedId);
  const activeFilterId =
    selectedFeedId && isFilterFeedId(selectedFeedId)
      ? fromFilterFeedId(selectedFeedId)
      : null;
  const activeFilter = activeFilterId
    ? smartFilters.find((f) => f.id === activeFilterId)
    : null;
  const handleLabel =
    selectedFeedId === ALL_FEEDS_ID
      ? "All items"
      : selectedFeedId === STARRED_FEED_ID
        ? "Starred"
        : activeFilter
          ? activeFilter.name
          : activeFeed?.title ?? "Feeds";

  return (
    // No `snapPoints` here: with a single snap point and an inline height,
    // vaul's snap-mode adds no value but it does intercept vertical drag
    // gestures inside scrollable content. The 2026-05-19 bug report
    // (long feed list, Settings unreachable) was that interception — vaul
    // ate the touch-move before the inner scroll could process it. Default
    // mode keeps vaul's standard "scroll until top, then drag to dismiss"
    // pattern, which is exactly what we want.
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <div
          data-testid="drawer-handle-strip"
          role="button"
          tabIndex={0}
          aria-label="Open feed list"
          className="flex items-center gap-2 px-4 h-[60px] shrink-0 border-t bg-background cursor-pointer"
          onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        >
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-muted-foreground/30" />
          <Layers className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium truncate">{handleLabel}</span>
          <ChevronUp
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </Drawer.Trigger>

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
