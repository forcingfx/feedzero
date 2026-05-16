import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronsUpDown,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useSyncStore } from "@/stores/sync-store.ts";
import { CHANGELOG_FEED_URL } from "@/utils/constants.ts";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsOnline } from "@/hooks/use-online.ts";
import { SettingsMenu } from "@/components/settings/settings-menu.tsx";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { QuotaIndicator } from "@/components/feeds/quota-indicator.tsx";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const settingsShortcutLabel = isMac ? "⌘," : "Ctrl+,";

function SyncBadge({ status, isOnline }: { status: string; isOnline: boolean }) {
  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <span className="rounded-full size-1.5 bg-muted-foreground/50" />
        Offline
      </span>
    );
  }
  if (status === "synced" || status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className={`rounded-full size-1.5 bg-emerald-500 ${status === "syncing" ? "animate-pulse" : ""}`} />
        {status === "syncing" ? "Syncing" : "Synced"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="rounded-full size-1.5 bg-red-500" />
        Error
      </span>
    );
  }
  // Local-only (and any unknown status): suppress the chip on the Settings
  // button. The amber "Local" indicator now lives inside the Settings
  // dropdown on the Cloud sync row — see SettingsMenu.
  return null;
}

function SidebarFooterMenu({ hasFeeds, onWhatsNew }: { hasFeeds: boolean; onWhatsNew: () => void }) {
  const syncStatus = useSyncStore((s) => s.status);
  const isOnline = useIsOnline();
  // SyncBadge returns null when the user is local-only AND online (that
  // indicator now lives inside the Settings dropdown instead). In that
  // case there's no chip on the second line, so render a single-line,
  // vertically-centered label instead of an empty two-row grid that
  // makes "Settings" look top-aligned.
  const hasChip = !isOnline || syncStatus !== "local-only";

  return (
    <SettingsMenu
      hasFeeds={hasFeeds}
      onWhatsNew={onWhatsNew}
      side="top"
      align="end"
      contentClassName="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
      trigger={
        <SidebarMenuButton
          size="lg"
          className="group/settings py-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex items-center justify-center size-8 rounded-lg bg-muted text-muted-foreground">
            <Settings className="size-4" />
          </div>
          {hasChip ? (
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Settings</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <SyncBadge status={syncStatus} isOnline={isOnline} />
                <Kbd className="h-4 text-[9px] px-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">{settingsShortcutLabel}</Kbd>
              </span>
            </div>
          ) : (
            <div className="flex flex-1 items-center text-left">
              <span className="flex-1 truncate text-base font-semibold">Settings</span>
              <Kbd className="h-5 text-[10px] px-1.5 mr-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">{settingsShortcutLabel}</Kbd>
            </div>
          )}
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      }
    />
  );
}

const LOCAL_STORAGE_WARNING_KEY = "feedzero:local-warning-dismissed";

function LocalStorageWarning() {
  const feeds = useFeedStore((s) => s.feeds);
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_WARNING_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (dismissed || feeds.length === 0 || syncStatus !== "local-only") {
    return null;
  }

  function handleDismiss() {
    try {
      localStorage.setItem(LOCAL_STORAGE_WARNING_KEY, "true");
    } catch {
      // localStorage unavailable
    }
    setDismissed(true);
  }

  return (
    <div className="mx-2 mb-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
      <div className="flex items-start justify-between gap-2">
        <p>
          Your feeds are stored locally. Clearing browser data will delete them.
        </p>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <button
        onClick={() => setSyncDialogOpen(true)}
        className="mt-1.5 underline hover:no-underline font-medium"
      >
        Enable cloud sync
      </button>
    </div>
  );
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const addFeed = useFeedStore((s) => s.addFeed);

  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();

  function handleSelect(feedId: string) {
    if (isMobile) setOpenMobile(false);
    if (onFeedSelect) onFeedSelect(feedId);
  }

  async function handleWhatsNew() {
    const existing = feeds.find((f) => f.url === CHANGELOG_FEED_URL);
    if (existing) {
      handleSelect(existing.id);
      navigate(`/feeds/${existing.id}`);
      return;
    }
    // Subscribe to the external release feed. addFeed goes through the feed
    // service, which fetches via the proxy (or directly — CORS is open).
    try {
      await addFeed(CHANGELOG_FEED_URL);
      const added = useFeedStore.getState().feeds.find(
        (f) => f.url === CHANGELOG_FEED_URL,
      );
      if (added) {
        handleSelect(added.id);
        navigate(`/feeds/${added.id}`);
      }
    } catch { /* noop */ }
  }

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader>
          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold tracking-tight">
                FeedZero
              </span>
              <div className="flex items-center gap-1">
                {feeds.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isRefreshingAll}
                        onClick={refreshAll}
                        className="size-8"
                      >
                        <RefreshCw
                          className={`size-4 ${isRefreshingAll ? "animate-spin" : ""}`}
                        />
                        <span className="sr-only">Refresh</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent hidden={isMobile}>
                      Refresh <Kbd className="ml-1">r</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarBody
                onFeedSelect={handleSelect}
                onBeforeNavigate={() => { if (isMobile) setOpenMobile(false); }}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <QuotaIndicator />
          <LocalStorageWarning />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarFooterMenu hasFeeds={feeds.length > 0} onWhatsNew={handleWhatsNew} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  );
}
