import { useState, useEffect, useMemo } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useNavigate, useLocation } from "react-router";
import {
  ChevronsUpDown,
  Cloud,
  ChevronRight,
  Compass,
  FolderPlus,
  Keyboard,
  Pencil,
  Layers,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { Switch } from "@/components/ui/switch.tsx";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog.tsx";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";
import { CHANGELOG_FEED_PATH } from "@/utils/constants.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsOnline } from "@/hooks/use-online.ts";
import type { Feed, Folder } from "@/types/index.ts";

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
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      <span className="rounded-full size-1.5 bg-amber-500" />
      Local
    </span>
  );
}

function SidebarFooterMenu({ hasFeeds, onWhatsNew }: { hasFeeds: boolean; onWhatsNew: () => void }) {
  const syncStatus = useSyncStore((s) => s.status);
  const setSyncDialogOpen = useSyncStore((s) => s.setDialogOpen);
  const isOnline = useIsOnline();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const handleWhatsNew = onWhatsNew;

  const isSyncOn = syncStatus === "synced" || syncStatus === "syncing";
  const isSyncing = syncStatus === "syncing";
  const canSync = hasFeeds;

  // Listen for Cmd/Ctrl+, to open settings dropdown
  useEffect(() => {
    const handler = () => setMenuOpen(true);
    document.addEventListener("feedzero:open-settings", handler);
    return () =>
      document.removeEventListener("feedzero:open-settings", handler);
  }, []);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="group/settings py-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex items-center justify-center size-8 rounded-lg bg-muted text-muted-foreground">
              <Settings className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Settings</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <SyncBadge status={syncStatus} isOnline={isOnline} />
                <Kbd className="h-4 text-[9px] px-1 opacity-0 group-hover/settings:opacity-100 transition-opacity">{settingsShortcutLabel}</Kbd>
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          side="top"
          align="end"
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
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard className="size-4" />
            <span>Keyboard shortcuts</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquare className="size-4" />
            <span>Send feedback</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleWhatsNew}>
            <Sparkles className="size-4" />
            <span>What&apos;s new</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
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

function DraggableFeedItem({ feed, inFolder, isActive, isRenaming, renameValue, isRefreshing, unreadCount, folders: folderList, onSelect, onRename, onStartRename, onCancelRename, onRenameChange, onRefresh, onReload, onDelete, onMoveToFolder }: {
  feed: Feed; inFolder: boolean; isActive: boolean; isRenaming: boolean; renameValue: string;
  isRefreshing: boolean; unreadCount: number; folders: Folder[];
  onSelect: () => void; onRename: (name: string) => void; onStartRename: () => void;
  onCancelRename: () => void; onRenameChange: (v: string) => void;
  onRefresh: () => void; onReload: () => void; onDelete: () => void;
  onMoveToFolder: (folderId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: feed.id });
  const Wrapper = inFolder ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonComp = inFolder ? SidebarMenuSubButton : SidebarMenuButton;

  return (
    <Wrapper ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} {...listeners}>
      {isRenaming ? (
        <form className="flex items-center gap-2 px-2 py-1" onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(renameValue.trim()); }}>
          <FeedFavicon siteUrl={feed.siteUrl} />
          <input autoFocus className="flex-1 bg-transparent text-sm outline-none border-b border-primary min-w-0"
            value={renameValue} onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onCancelRename} onKeyDown={(e) => { if (e.key === "Escape") onCancelRename(); }} />
        </form>
      ) : (
        <ButtonComp isActive={isActive} onClick={onSelect}>
          <FeedFavicon siteUrl={feed.siteUrl} />
          <span className="truncate">{feed.title}</span>
          {isRefreshing && <RefreshCw className="size-3 animate-spin shrink-0 text-muted-foreground" />}
        </ButtonComp>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover className="focus-visible:ring-0">
            <MoreHorizontal />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={onStartRename}><Pencil className="size-4" /> Rename</DropdownMenuItem>
          {folderList.length > 0 && (
            <>
              <DropdownMenuItem onClick={() => onMoveToFolder(null)} disabled={!feed.folderId}>Unfiled</DropdownMenuItem>
              {folderList.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => onMoveToFolder(f.id)} disabled={feed.folderId === f.id}>→ {f.name}</DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem onClick={onRefresh}><RefreshCw className="size-4" /> Refresh</DropdownMenuItem>
          <DropdownMenuItem onClick={onReload}><RotateCcw className="size-4" /> Clear cached articles</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!isRefreshing && unreadCount > 0 && (
        <SidebarMenuBadge className="rounded-lg bg-primary/10 text-primary text-[10px] font-semibold group-hover/menu-item:md:opacity-0 group-focus-within/menu-item:md:opacity-0 group-has-[[data-state=open]]/menu-item:md:opacity-0 transition-opacity">
          {unreadCount > 99 ? "99+" : unreadCount}
        </SidebarMenuBadge>
      )}
    </Wrapper>
  );
}

function DroppableFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? "bg-accent/50 rounded-md transition-colors" : "transition-colors"}>
      {children}
    </div>
  );
}

export function AppSidebar({ onFeedSelect, ...props }: AppSidebarProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const unreadCounts = useArticleStore((s) => s.unreadCounts);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const reloadSingleFeed = useFeedStore((s) => s.reloadSingleFeed);
  const renameFeed = useFeedStore((s) => s.renameFeed);
  const folders = useFeedStore((s) => s.folders);
  const createFolder = useFeedStore((s) => s.createFolder);
  const renameFolder = useFeedStore((s) => s.renameFolder);
  const deleteFolder = useFeedStore((s) => s.deleteFolder);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const refreshingFeedIds = useFeedStore((s) => s.refreshingFeedIds);

  const addFeed = useFeedStore((s) => s.addFeed);

  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isExplorePage = pathname === "/explore";
  const [feedToRemove, setFeedToRemove] = useState<Feed | null>(null);
  const [feedToReload, setFeedToReload] = useState<Feed | null>(null);
  const [renamingFeedId, setRenamingFeedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const unfiledFeeds = useMemo(() => feeds.filter((f) => !f.folderId), [feeds]);
  const feedsByFolder = useMemo(() => {
    const map = new Map<string, typeof feeds>();
    for (const feed of feeds) {
      if (!feed.folderId) continue;
      const list = map.get(feed.folderId);
      if (list) list.push(feed);
      else map.set(feed.folderId, [feed]);
    }
    return map;
  }, [feeds]);

  function handleSelect(feedId: string) {
    if (isMobile) setOpenMobile(false);
    if (onFeedSelect) onFeedSelect(feedId);
  }

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const feedId = active.id as string;
    const targetFolderId = over.id === "unfiled" ? null : (over.id as string);
    moveFeedToFolder(feedId, targetFolderId);
  }

  function renderFeedItem(feed: Feed, inFolder = false) {
    return <DraggableFeedItem key={feed.id} feed={feed} inFolder={inFolder}
      isActive={feed.id === selectedFeedId}
      isRenaming={renamingFeedId === feed.id}
      renameValue={renameValue}
      isRefreshing={refreshingFeedIds.has(feed.id)}
      unreadCount={unreadCounts[feed.id] ?? 0}
      folders={folders}
      onSelect={() => handleSelect(feed.id)}
      onRename={(name) => { renameFeed(feed.id, name); setRenamingFeedId(null); }}
      onStartRename={() => { setRenameValue(feed.title); setRenamingFeedId(feed.id); }}
      onCancelRename={() => setRenamingFeedId(null)}
      onRenameChange={setRenameValue}
      onRefresh={() => refreshSingleFeed(feed.id)}
      onReload={() => setFeedToReload(feed)}
      onDelete={() => setFeedToRemove(feed)}
      onMoveToFolder={(folderId) => moveFeedToFolder(feed.id, folderId)}
    />;
  }

  async function handleWhatsNew() {
    const existing = feeds.find((f) => f.url.includes(CHANGELOG_FEED_PATH));
    if (existing) {
      handleSelect(existing.id);
      navigate(`/feeds/${existing.id}`);
      return;
    }
    // Subscribe by fetching XML directly (same origin, no proxy needed)
    try {
      const res = await fetch(CHANGELOG_FEED_PATH);
      if (!res.ok) return;
      const xml = await res.text();
      const changelogUrl = `${window.location.origin}${CHANGELOG_FEED_PATH}`;
      await addFeed(changelogUrl, xml);
      const { feeds: updated } = useFeedStore.getState();
      const added = updated.find((f) => f.url.includes(CHANGELOG_FEED_PATH));
      if (added) {
        handleSelect(added.id);
        navigate(`/feeds/${added.id}`);
      }
    } catch { /* noop */ }
  }

  function handleConfirmRemove() {
    if (feedToRemove) {
      removeFeed(feedToRemove.id);
      setFeedToRemove(null);
    }
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
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isExplorePage}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                      navigate("/explore");
                    }}
                    tooltip="Explore"
                  >
                    <Compass className="size-4" />
                    <span>Explore</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {feeds.length > 0 && (
                  <>
                    <SidebarMenuItem key="all-items">
                      <SidebarMenuButton
                        isActive={selectedFeedId === ALL_FEEDS_ID}
                        onClick={() => handleSelect(ALL_FEEDS_ID)}
                        tooltip="All items"
                      >
                        <Layers className="size-4" />
                        <span>All items</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarSeparator className="mx-0 my-1" />
                    <DndContext sensors={sensors} onDragStart={(e) => setActiveDragId(e.active.id as string)} onDragEnd={handleDragEnd}>
                    <DroppableFolder id="unfiled">
                    {unfiledFeeds.map((feed) => renderFeedItem(feed))}
                    </DroppableFolder>
                    {folders.map((folder) => {
                      const folderFeeds = feedsByFolder.get(folder.id) ?? [];
                      return (
                        <DroppableFolder key={folder.id} id={folder.id}>
                        <SidebarMenuItem>
                          <Collapsible.Root className="group/folder" defaultOpen>
                            {renamingFolderId === folder.id ? (
                              <form
                                className="flex items-center gap-2 px-2 py-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (folderRenameValue.trim()) renameFolder(folder.id, folderRenameValue.trim());
                                  setRenamingFolderId(null);
                                }}
                              >
                                <ChevronRight className="size-3.5" />
                                <input
                                  autoFocus
                                  className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary min-w-0"
                                  value={folderRenameValue}
                                  onChange={(e) => setFolderRenameValue(e.target.value)}
                                  onBlur={() => setRenamingFolderId(null)}
                                  onKeyDown={(e) => { if (e.key === "Escape") setRenamingFolderId(null); }}
                                />
                              </form>
                            ) : (
                              <Collapsible.Trigger asChild>
                                <SidebarMenuButton className="font-medium">
                                  <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/folder:rotate-90" />
                                  <span className="truncate">{folder.name}</span>
                                  <span className="ml-auto text-[10px] text-muted-foreground">{folderFeeds.length}</span>
                                </SidebarMenuButton>
                              </Collapsible.Trigger>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover className="focus-visible:ring-0">
                                  <MoreHorizontal />
                                  <span className="sr-only">Folder options</span>
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start">
                                <DropdownMenuItem onClick={() => { setFolderRenameValue(folder.name); setRenamingFolderId(folder.id); }}>
                                  <Pencil className="size-4" />
                                  Rename folder
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setFolderToDelete(folder)}>
                                  <Trash2 className="size-4" />
                                  Delete folder
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Collapsible.Content>
                              <SidebarMenuSub>
                                {folderFeeds.map((feed) => renderFeedItem(feed, true))}
                              </SidebarMenuSub>
                            </Collapsible.Content>
                          </Collapsible.Root>
                        </SidebarMenuItem>
                        </DroppableFolder>
                      );
                    })}
                    <DragOverlay>
                      {activeDragId ? (
                        <div className="rounded-md bg-card border shadow-lg px-3 py-1.5 text-sm">
                          {feeds.find((f) => f.id === activeDragId)?.title}
                        </div>
                      ) : null}
                    </DragOverlay>
                    </DndContext>
                    <SidebarSeparator className="mx-0 my-1" />
                    <SidebarMenuItem>
                      {creatingFolder ? (
                        <form
                          className="flex items-center gap-2 px-2 py-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (newFolderName.trim()) createFolder(newFolderName.trim());
                            setCreatingFolder(false);
                            setNewFolderName("");
                          }}
                        >
                          <FolderPlus className="size-4 text-muted-foreground" />
                          <input
                            autoFocus
                            placeholder="Folder name"
                            className="flex-1 bg-transparent text-sm outline-none border-b border-primary min-w-0"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onBlur={() => { setCreatingFolder(false); setNewFolderName(""); }}
                            onKeyDown={(e) => { if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); } }}
                          />
                        </form>
                      ) : (
                        <SidebarMenuButton
                          className="text-muted-foreground"
                          onClick={() => setCreatingFolder(true)}
                        >
                          <FolderPlus className="size-4" />
                          <span>New folder</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <LocalStorageWarning />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarFooterMenu hasFeeds={feeds.length > 0} onWhatsNew={handleWhatsNew} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <AlertDialog
        open={feedToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove feed</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &ldquo;{feedToRemove?.title}&rdquo;? This will also delete
              all its articles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={feedToReload !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToReload(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear cached articles</AlertDialogTitle>
            <AlertDialogDescription>
              All articles for &ldquo;{feedToReload?.title}&rdquo; will be deleted
              and reloaded from the source. Read/unread status will be lost.
              Older articles may not be available if the feed no longer provides them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (feedToReload) {
                  reloadSingleFeed(feedToReload.id);
                  setFeedToReload(null);
                }
              }}
            >
              Clear and reload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={folderToDelete !== null}
        onOpenChange={(open) => { if (!open) setFolderToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{folderToDelete?.name}&rdquo;? Feeds in this folder
              will be moved to the top level, not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (folderToDelete) {
                  deleteFolder(folderToDelete.id);
                  setFolderToDelete(null);
                }
              }}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
