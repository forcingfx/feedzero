import { useState, useEffect } from "react";
import {
  Cloud,
  Keyboard,
  Layers,
  Loader2,
  MessageSquare,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useSyncStore } from "@/stores/sync-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog.tsx";

interface SettingsMenuBaseProps {
  hasFeeds: boolean;
  onWhatsNew: () => void;
}

interface SettingsMenuDropdownProps extends SettingsMenuBaseProps {
  variant?: "dropdown";
  trigger: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  contentClassName?: string;
}

interface SettingsMenuListProps extends SettingsMenuBaseProps {
  variant: "list";
}

type SettingsMenuProps = SettingsMenuDropdownProps | SettingsMenuListProps;

/**
 * Shared settings UI for the desktop sidebar (dropdown) and mobile drawer
 * (inline list). Owns the dialogs (keyboard shortcuts, feedback, auto-organize)
 * and the cmd/ctrl+, listener. The variant prop swaps the wrapper without
 * duplicating the per-item logic.
 */
export function SettingsMenu(props: SettingsMenuProps) {
  const { hasFeeds, onWhatsNew } = props;

  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const setGroupArticleFloods = useAppStore((s) => s.setGroupArticleFloods);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isSyncOn = syncStatus === "synced" || syncStatus === "syncing";
  const isSyncing = syncStatus === "syncing";
  const canSync = hasFeeds;
  const showSync = canSync || isSyncOn;

  useEffect(() => {
    const handler = () => setMenuOpen(true);
    document.addEventListener("feedzero:open-settings", handler);
    return () =>
      document.removeEventListener("feedzero:open-settings", handler);
  }, []);

  const dialogs = (
    <>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <AutoOrganizeDialog open={autoOrganizeOpen} onOpenChange={setAutoOrganizeOpen} />
    </>
  );

  if (props.variant === "list") {
    return (
      <>
        <SidebarMenu>
          {showSync && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setSyncDialogOpen(true)}>
                {isSyncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Cloud className="size-4" />
                )}
                <span className="flex-1">Cloud sync</span>
                <Switch
                  size="sm"
                  checked={isSyncOn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSyncDialogOpen(true);
                  }}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {hasFeeds && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setAutoOrganizeOpen(true)}>
                <Wand2 className="size-4" />
                <span>Auto-organize feeds</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setGroupArticleFloods(!groupArticleFloods)}
            >
              <Layers className="size-4" />
              <span className="flex-1">Group article floods</span>
              <Switch
                size="sm"
                checked={groupArticleFloods}
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupArticleFloods(!groupArticleFloods);
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
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
            <SidebarMenuButton onClick={onWhatsNew}>
              <Sparkles className="size-4" />
              <span>What&apos;s new</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {dialogs}
      </>
    );
  }

  const { trigger, side = "top", align = "end", contentClassName } = props;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          className={contentClassName ?? "min-w-56 rounded-lg"}
          side={side}
          align={align}
          sideOffset={4}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                disabled={!canSync && !isSyncOn}
                onSelect={(e) => {
                  e.preventDefault();
                  if (canSync || isSyncOn) setSyncDialogOpen(true);
                }}
              >
                <div className="flex items-center gap-2 flex-1">
                  {isSyncing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Cloud className="size-4" />
                  )}
                  <span>Cloud sync</span>
                  {syncStatus === "local-only" && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <span className="rounded-full size-1.5 bg-amber-500" />
                      Local
                    </span>
                  )}
                </div>
                <Switch
                  size="sm"
                  checked={isSyncOn}
                  disabled={!canSync && !isSyncOn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canSync || isSyncOn) setSyncDialogOpen(true);
                  }}
                />
              </DropdownMenuItem>
            </TooltipTrigger>
            {!canSync && !isSyncOn && (
              <TooltipContent side="left">
                Add a feed first to enable sync
              </TooltipContent>
            )}
          </Tooltip>
          {hasFeeds && (
            <DropdownMenuItem onSelect={() => setAutoOrganizeOpen(true)}>
              <Wand2 className="size-4" />
              <span>Auto-organize feeds</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setGroupArticleFloods(!groupArticleFloods);
            }}
          >
            <div className="flex items-center gap-2 flex-1">
              <Layers className="size-4" />
              <span>Group article floods</span>
            </div>
            <Switch
              size="sm"
              checked={groupArticleFloods}
              onClick={(e) => {
                e.stopPropagation();
                setGroupArticleFloods(!groupArticleFloods);
              }}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard className="size-4" />
            <span>Keyboard shortcuts</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquare className="size-4" />
            <span>Send feedback</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onWhatsNew}>
            <Sparkles className="size-4" />
            <span>What&apos;s new</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
