import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronUp, Layers } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID, CHANGELOG_FEED_URL } from "@/utils/constants.ts";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { SettingsMenu } from "@/components/settings/settings-menu.tsx";

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const addFeed = useFeedStore((s) => s.addFeed);
  const navigate = useNavigate();

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

  async function handleWhatsNew() {
    setOpen(false);
    const existing = feeds.find((f) => f.url === CHANGELOG_FEED_URL);
    if (existing) {
      onFeedSelect(existing.id);
      navigate(`/feeds/${existing.id}`);
      return;
    }
    try {
      await addFeed(CHANGELOG_FEED_URL);
      const added = useFeedStore.getState().feeds.find((f) => f.url === CHANGELOG_FEED_URL);
      if (added) {
        onFeedSelect(added.id);
        navigate(`/feeds/${added.id}`);
      }
    } catch { /* noop */ }
  }

  const activeFeed = feeds.find((f) => f.id === selectedFeedId);
  const handleLabel =
    selectedFeedId === ALL_FEEDS_ID
      ? "All items"
      : activeFeed?.title ?? "Feeds";

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} snapPoints={[0.85]}>
      {/* In-flow handle — always visible, 60px, part of the flex column */}
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

          {/*
            SidebarProvider's default wrapper is `flex min-h-svh w-full` (row, viewport-tall).
            Inside a height-bounded drawer that lays out content vertically, we override to
            `block min-h-0` so children stack vertically and the inner overflow-y-auto can
            do its job without competing with min-h-svh.
          */}
          <SidebarProvider defaultOpen={false} className="block min-h-0">
            <div
              data-testid="drawer-scroll"
              // Padding-bottom = home-indicator inset + iOS toolbar slack + breathing room.
              // - `env(safe-area-inset-bottom)`: iPhone home-indicator strip (~34px on
              //   modern iPhones in PWA / no-toolbar contexts).
              // - `calc(100vh - 100dvh)`: iOS Safari's dynamic bottom toolbar
              //   (~70-80px on iPhones). Zero when the toolbar is collapsed. The
              //   prior fix omitted this — leaving the last drawer row occluded
              //   when the toolbar was up. See `tests/components/layout/mobile-nav-drawer.test.tsx`
              //   for the regression guard.
              // - `2rem`: visual breathing room so the last row isn't pressed against
              //   the very edge.
              // Vaul positions the outer Drawer.Content itself; the only place we
              // can reliably enforce safe-area is here on the inner scroll.
              className="overflow-y-auto overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)_+_(100vh_-_100dvh)_+_2rem)]"
              style={{ height: "calc(85dvh - 1.25rem)" }}
            >
              <div data-testid="drawer-section" className="w-full py-1 px-3">
                <SidebarBody
                  onFeedSelect={handleSelect}
                  onBeforeNavigate={() => setOpen(false)}
                />
              </div>

              {/*
                Settings as direct rows (variant="list"). A dropdown anchored to
                the drawer bottom gets covered by iOS Safari browser chrome —
                listing every option in-flow keeps them all reachable with one tap.
              */}
              <div data-testid="drawer-section" className="border-t mt-2 px-3 py-1">
                <SettingsMenu
                  variant="list"
                  hasFeeds={feeds.length > 0}
                  onWhatsNew={handleWhatsNew}
                />
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
