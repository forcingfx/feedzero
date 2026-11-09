import { useLocation, useNavigate } from "react-router";
import {
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useCommandPaletteStore } from "@/stores/command-palette-store.ts";
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
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsOnline } from "@/hooks/use-online.ts";
import { SidebarBody } from "@/components/layout/sidebar-body.tsx";
import { SidebarAddMenu } from "@/components/layout/sidebar-add-menu.tsx";
import { QuotaIndicator } from "@/components/feeds/quota-indicator.tsx";
import { goToSettings } from "@/lib/go-to-settings.ts";
import { BrandMark } from "@/components/brand/brand-mark.tsx";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onFeedSelect?: (feedId: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const settingsShortcutLabel = isMac ? "⌘," : "Ctrl+,";
const commandPaletteShortcutLabel = isMac ? "⌘K" : "Ctrl+K";

function SyncBadge({ status, isOnline }: { status: string; isOnline: boolean }) {
  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        <span className="rounded-full size-1.5 bg-muted-foreground/50" />
        Offline
      </span>
    );
  }
  if (status === "synced" || status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
        <span className={`rounded-full size-1.5 bg-success ${status ==="syncing" ? "animate-pulse" : ""}`} />
        {status === "syncing" ? "Syncing" : "Synced"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
        <span className="rounded-full size-1.5 bg-destructive" />
        Error
      </span>
    );
  }
  // Local-only (and any unknown status): suppress the chip on the Settings
  // button. The "Cloud sync" launcher lives inside Settings → Account.
  return null;
}

function SidebarFooterMenu() {
  const syncStatus = useSyncStore((s) => s.status);
  const isOnline = useIsOnline();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = pathname === "/settings";
  // SyncBadge returns null when the user is local-only AND online —
  // collapse to a single-line label in that case so "Settings" looks
  // vertically centered instead of top-anchored in an empty two-row grid.
  const hasChip = !isOnline || syncStatus !== "local-only";

  return (
    <SidebarMenuButton
      size="lg"
      onClick={() => goToSettings(navigate)}
      isActive={isActive}
      className="group/settings py-3"
    >
      <div className="flex items-center justify-center size-8 rounded-lg bg-muted text-muted-foreground">
        <Settings className="size-4" />
      </div>
      {hasChip ? (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">Settings</span>
          <span className="flex items-center gap-1.5 mt-0.5">
            <SyncBadge status={syncStatus} isOnline={isOnline} />
            <Kbd className="h-4 text-xs px-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">
              {settingsShortcutLabel}
            </Kbd>
          </span>
        </div>
      ) : (
        <div className="flex flex-1 items-center text-left">
          <span className="flex-1 truncate text-base font-semibold">Settings</span>
          <Kbd className="h-5 text-xs px-1.5 mr-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">
            {settingsShortcutLabel}
          </Kbd>
        </div>
      )}
    </SidebarMenuButton>
  );
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);

  const { isMobile, setOpenMobile } = useSidebar();

  function handleSelect(feedId: string) {
    if (isMobile) setOpenMobile(false);
    if (onFeedSelect) onFeedSelect(feedId);
  }

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader>
          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
                <BrandMark className="size-6" alt="" />
                FeedZero
              </span>
              <div className="flex items-center gap-1">
                <SidebarAddMenu />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => useCommandPaletteStore.getState().open()}
                      className="size-8"
                    >
                      <Search className="size-4" />
                      <span className="sr-only">Open command palette</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent hidden={isMobile}>
                    Command palette{" "}
                    <Kbd className="ml-1">{commandPaletteShortcutLabel}</Kbd>
                  </TooltipContent>
                </Tooltip>
                {feeds.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isRefreshingAll}
                        onClick={() => refreshAll()}
                        className="size-8"
                      >
                        <RefreshCw
                          className={`size-4 ${isRefreshingAll ?"animate-spin" : ""}`}
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarFooterMenu />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  );
}
