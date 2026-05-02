import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ChevronUp,
  Cloud,
  Keyboard,
  Layers,
  Loader2,
  MessageSquare,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Drawer } from "vaul";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { ALL_FEEDS_ID, CHANGELOG_FEED_URL } from "@/utils/constants.ts";
import {
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar.tsx";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog.tsx";

interface MobileNavDrawerProps {
  onFeedSelect: (feedId: string) => void;
}

export function MobileNavDrawer({ onFeedSelect }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const addFeed = useFeedStore((s) => s.addFeed);
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
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

  const isSyncOn = syncStatus === "synced" || syncStatus === "syncing";
  const isSyncing = syncStatus === "syncing";
  const canSync = feeds.length > 0;

  return (
    <>
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
              `block min-h-0` so the feed list and settings row stack vertically and the inner
              overflow-y-auto can do its job without competing with min-h-svh.
            */}
            <SidebarProvider defaultOpen={false} className="block min-h-0">
              <div
                data-testid="drawer-scroll"
                className="overflow-y-auto overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)_+_2rem)]"
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

                {/*
                  Settings inlined as direct rows. A dropdown anchored to the
                  drawer bottom gets covered by iOS Safari browser chrome — listing
                  every option in-flow keeps them all reachable with one tap.
                */}
                <div className="border-t mt-2">
                  <SidebarMenu>
                    {canSync || isSyncOn ? (
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setSyncDialogOpen(true)}>
                          {isSyncing ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
                          <span className="flex-1">Cloud sync</span>
                          <Switch size="sm" checked={isSyncOn} onClick={(e) => { e.stopPropagation(); setSyncDialogOpen(true); }} />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ) : null}
                    {feeds.length > 0 && (
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setAutoOrganizeOpen(true)}>
                          <Wand2 className="size-4" />
                          <span>Auto-organize feeds</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => setShortcutsOpen(true)}>
                        <Keyboard className="size-4" />
                        <span>Keyboard shortcuts</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => setFeedbackOpen(true)}>
                        <MessageSquare className="size-4" />
                        <span>Send feedback</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={handleWhatsNew}>
                        <Sparkles className="size-4" />
                        <span>What&apos;s new</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </div>
              </div>
            </SidebarProvider>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <AutoOrganizeDialog open={autoOrganizeOpen} onOpenChange={setAutoOrganizeOpen} />
    </>
  );
}
