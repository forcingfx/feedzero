import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronUp, Layers, Settings } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { goToSettings } from "@/lib/go-to-settings.ts";

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);

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

  const activeFeed = feeds.find((f) => f.id === selectedFeedId);
  const handleLabel =
    selectedFeedId === ALL_FEEDS_ID
      ? "All items"
      : activeFeed?.title ?? "Feeds";

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} snapPoints={[0.85]}>
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

          <SidebarProvider defaultOpen={false} className="block min-h-0">
            <div
              data-testid="drawer-scroll"
              // pb-[calc(env(safe-area-inset-bottom) + (100vh - 100dvh) + 2rem)]:
              //   home-indicator inset + iOS Safari toolbar slack + breathing room.
              //   Vaul positions the outer Drawer.Content; this inner scroll is the
              //   only place we can reliably enforce the safe-area floor.
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
                Single Settings entry. Tapping it closes the drawer and opens
                the unified Settings dialog (account / reading / help / import
                / export). The dialog is screen-centered — unlike a dropdown
                anchored to the drawer bottom, it isn't occluded by iOS Safari
                chrome, so we no longer need every Settings item inlined here.
              */}
              <div data-testid="drawer-section" className="border-t mt-2 px-3 py-1">
                <button
                  type="button"
                  onClick={handleSettings}
                  className="flex items-center gap-3 w-full px-2 py-3 text-left text-sm font-medium rounded-md hover:bg-accent"
                >
                  <Settings className="size-4 shrink-0 text-muted-foreground" />
                  Settings
                </button>
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
