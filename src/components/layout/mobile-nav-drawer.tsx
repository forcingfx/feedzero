import { useState, useEffect, useRef, forwardRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { Compass, FolderPlus, Layers, RefreshCw, Settings, Sparkles } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { MOBILE_DOCK_FEED_CAP } from "@/lib/recent-feeds.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { NewFolderForm } from "@/components/sidebar/new-folder-input.tsx";
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill.tsx";
import { goToSettings } from "@/lib/go-to-settings.ts";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge.tsx";
import { useMinimizeOnScroll } from "@/hooks/use-scroll-direction.ts";
import { cn } from "@/lib/utils";

type Section = "feeds" | "explore" | "signal" | "settings";

const SECTION_LABEL: Record<Section, string> = {
  feeds: "Feeds",
  explore: "Explore",
  signal: "Signal",
  settings: "Settings",
};

/** The icon the minimized tab bar shows: the current section's tab. */
function SectionIcon({ section }: { section: Section }) {
  const Icon = { feeds: Layers, explore: Compass, signal: Sparkles, settings: Settings }[section];
  return <Icon className="size-5" />;
}

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

const FOOTER_ICON_BUTTON =
  "flex items-center justify-center size-11 shrink-0 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50";

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The strip's handle pill advertises "drag me up" — honor it: an
  // upward-dominant drag on the strip opens the drawer (tapping the
  // chevron still works). Tracked per-gesture so a horizontal scrub
  // across the favicons doesn't trigger it.
  const stripTouchRef = useRef<{ x: number; y: number } | null>(null);
  function handleStripTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    stripTouchRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  }
  function handleStripTouchMove(e: React.TouchEvent) {
    const start = stripTouchRef.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dy < -20 && Math.abs(dy) > Math.abs(dx)) {
      stripTouchRef.current = null;
      setOpen(true);
    }
  }
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

  const recentFeedIds = useFeedStore((s) => s.recentFeedIds);
  // Recent feeds: the first row of the open drawer. Recency picks WHICH
  // feeds are here, sidebar order picks WHERE, so the row never reorders
  // under the thumb. Unlike the old closed dock, the row is not padded
  // with never-viewed feeds: the full list is right below it.
  const recentSet = new Set(recentFeedIds.slice(0, MOBILE_DOCK_FEED_CAP));
  const recentFeeds = feeds.filter((feed) => recentSet.has(feed.id));

  // Which tab is current. Feeds covers every route that is not one of the
  // other three sections (the list, a folder, a filter, an article).
  const section: Section = pathname.startsWith("/explore")
    ? "explore"
    : pathname.startsWith("/signal")
      ? "signal"
      : pathname.startsWith("/settings")
        ? "settings"
        : "feeds";
  const [minimized, setMinimized] = useMinimizeOnScroll(section);

  return (
    // No `snapPoints` here: with a single snap point and an inline height,
    // vaul's snap-mode adds no value but it does intercept vertical drag
    // gestures inside scrollable content. The 2026-05-19 bug report
    // (long feed list, Settings unreachable) was that interception — vaul
    // ate the touch-move before the inner scroll could process it. Default
    // mode keeps vaul's standard "scroll until top, then drag to dismiss"
    // pattern, which is exactly what we want.
    <Drawer.Root open={open} onOpenChange={setOpen}>
      {/* Liquid-glass tab bar (Apple HIG, Tab bars, iOS): a capsule that
          floats above content, minimizes to the current tab at the
          bottom-left while content scrolls down, and comes back when that
          tab is tapped or content scrolls up. The strip itself lets taps
          through, so content beside the minimized capsule stays usable;
          an upward swipe on the capsule still opens the feed list. */}
      <nav
        data-testid="drawer-handle-strip"
        data-minimized={minimized}
        aria-label="Sections"
        onTouchStart={handleStripTouchStart}
        onTouchMove={handleStripTouchMove}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      >
        <div className="relative h-14">
          <div
            data-testid="tab-capsule"
            className={cn(
              "liquid-glass pointer-events-auto absolute bottom-0 left-0 h-14 overflow-hidden rounded-full",
              "transition-[width] duration-300 ease-out motion-reduce:transition-none",
              minimized ? "w-14" : "w-full",
            )}
          >
            <div
              aria-hidden={minimized || undefined}
              className={cn(
                "absolute inset-0 flex items-center gap-1 px-1.5 transition-opacity duration-200 motion-reduce:transition-none",
                minimized && "pointer-events-none opacity-0",
              )}
            >
              <Drawer.Trigger asChild>
                <TabButton label="Feeds" aria-label="Feeds, open feed list" current={section === "feeds"} tabIndex={minimized ? -1 : 0}>
                  <Layers className="size-5" />
                </TabButton>
              </Drawer.Trigger>
              <TabButton label="Explore" current={section === "explore"} tabIndex={minimized ? -1 : 0} onClick={() => navigate("/explore")}>
                <Compass className="size-5" />
              </TabButton>
              <TabButton
                label="Signal"
                current={section === "signal"}
                tabIndex={minimized ? -1 : 0}
                data-testid="sidebar-signal-link"
                onClick={() => navigate("/signal")}
              >
                <Sparkles className="size-5" />
              </TabButton>
              <TabButton label="Settings" current={section === "settings"} tabIndex={minimized ? -1 : 0} onClick={() => goToSettings(navigate)}>
                <Settings className="size-5" />
              </TabButton>
            </div>
            <button
              type="button"
              aria-hidden={!minimized || undefined}
              tabIndex={minimized ? 0 : -1}
              aria-label={`${SECTION_LABEL[section]}, show all tabs`}
              onClick={() => setMinimized(false)}
              className={cn(
                "absolute inset-y-0 left-0 flex w-14 items-center justify-center rounded-full text-foreground",
                "transition-opacity duration-200 motion-reduce:transition-none",
                !minimized && "pointer-events-none opacity-0",
              )}
            >
              <SectionIcon section={section} />
            </button>
          </div>
        </div>
      </nav>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          data-testid="drawer-content"
          // Content-sized up to 85dvh: a short feed list gets a short
          // drawer instead of a blank gap above the footer (2026-11-02).
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-xl focus:outline-none overflow-hidden"
          style={{ maxHeight: "85dvh" }}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mt-3 mb-1 shrink-0" />

          {/* No flex-1 below: these blocks shrink from their content size
              (min-h-0) when the 85dvh cap bites, and otherwise stay as
              tall as the list, so the drawer hugs a short list. */}
          <SidebarProvider defaultOpen={false} className="flex flex-col min-h-0">
            <div
              data-testid="drawer-scroll"
              // No safe-area or toolbar padding: the pinned footer sits
              // between this scroll and the screen edge and owns that
              // clearance. Padding here would be a visible blank gap.
              className="min-h-0 overflow-y-auto overflow-x-hidden pb-1"
            >
              {recentFeeds.length > 0 && (
                <div
                  data-testid="drawer-recent-feeds"
                  aria-label="Recent feeds"
                  className="flex items-center gap-1 overflow-x-auto px-3 pt-1 pb-2"
                >
                  {recentFeeds.map((feed) => {
                    const active = feed.id === selectedFeedId;
                    return (
                      <button
                        key={feed.id}
                        type="button"
                        aria-label={feed.title}
                        aria-pressed={active}
                        onClick={() => handleSelect(feed.id)}
                        className={`flex items-center justify-center size-11 shrink-0 rounded-md hover:bg-accent/50 ${
                          active ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                        }`}
                      >
                        <FeedFavicon siteUrl={feed.siteUrl} className="size-6" />
                      </button>
                    );
                  })}
                </div>
              )}
              <div data-testid="drawer-section" className="w-full py-1 px-3">
                <SidebarBody
                  onFeedSelect={handleSelect}
                  onBeforeNavigate={() => setOpen(false)}
                  inDrawer
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

              Pads for the home indicator only, like the closed dock
              strip. Safari already lays this fixed drawer out above its
              toolbar; a (100vh - 100dvh) term here added a toolbar's
              height of dead space that the fixed-height drawer took from
              the feed list (~200px on iPhone, 2026-09-28 report).
            */}
            <div
              data-testid="drawer-section"
              className="shrink-0 border-t bg-background px-3 py-1 pb-[calc(env(safe-area-inset-bottom)_+_0.25rem)]"
            >
              {creatingFolder && <NewFolderForm onDone={() => setCreatingFolder(false)} />}
              {/* One lean row: status on the left, icon actions on the
                  right. The status text truncates before any action is
                  squeezed off the row. */}
              <div data-testid="drawer-footer-actions" className="flex items-center gap-1">
                <div className="min-w-0 flex-1 truncate px-2">
                  <SyncStatusBadge onClick={() => setOpen(false)} />
                </div>
                <AutoOrganizePill />
                <button
                  type="button"
                  aria-label="New folder"
                  onClick={() => setCreatingFolder(true)}
                  className={FOOTER_ICON_BUTTON}
                >
                  <FolderPlus className="size-5" />
                </button>
                {feeds.length > 0 && (
                  <button
                    type="button"
                    data-testid="drawer-refresh-all"
                    aria-label={isRefreshingAll ? "Refreshing…" : "Refresh all"}
                    onClick={() => void refreshAll()}
                    disabled={isRefreshingAll}
                    className={FOOTER_ICON_BUTTON}
                  >
                    <RefreshCw className={`size-5 ${isRefreshingAll ? "animate-spin" : ""}`} />
                  </button>
                )}
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * One tab of the closed bottom bar: icon over a 12 px label, 44 px tall,
 * sharing the width with its siblings. Forwards the ref so it can be the
 * drawer's trigger.
 */
const TabButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; current: boolean }
>(function TabButton({ label, current, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors",
        current ? "bg-foreground/10 text-foreground" : "text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
      <span className="leading-none">{label}</span>
    </button>
  );
});
