import { useState, useEffect } from "react";
import { ChevronUp, Layers, Settings } from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import {
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar.tsx";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);

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
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background border-t rounded-t-xl focus:outline-none"
          style={{ height: "85dvh" }}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mt-3 mb-1 shrink-0" />

          {/*
            SidebarProvider's default wrapper is `flex min-h-svh w-full` (row, viewport-tall).
            Inside a height-bounded drawer that lays out content vertically, we override to
            `block min-h-0` so the feed list and Settings row stack vertically and the inner
            overflow-y-auto can do its job without competing with min-h-svh.
          */}
          <SidebarProvider defaultOpen={false} className="block min-h-0">
            <div
              data-testid="drawer-scroll"
              className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)_+_2rem)]"
              style={{ height: "calc(85dvh - 1.25rem)" }}
            >
              <div className="w-full py-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={selectedFeedId === ALL_FEEDS_ID}
                      onClick={() => handleSelect(ALL_FEEDS_ID)}
                    >
                      <Layers className="size-4" />
                      <span>All items</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarSeparator className="mx-0 my-1" />
                  <SidebarFeedList onFeedSelect={handleSelect} />
                </SidebarMenu>
              </div>

              <div className="border-t mt-2 px-2 py-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => { setSyncDialogOpen(true); setOpen(false); }}>
                      <Settings className="size-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            </div>
          </SidebarProvider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
