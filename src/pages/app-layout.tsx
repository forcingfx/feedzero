import { useEffect } from "react";
import { Outlet, useNavigate, useLocation, useParams } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh.ts";
import { useSignalMidnightRefresh } from "@/hooks/use-signal-midnight-refresh.ts";
import { useBriefingAutoRefresh } from "@/hooks/use-briefing-auto-refresh.ts";
import { useLicenseRefresh } from "@/hooks/use-license-refresh.ts";
import { useSharedSidebarSize } from "@/hooks/use-shared-sidebar-size.ts";
import { useSidebar } from "@/components/ui/sidebar.tsx";
import { ALL_FEEDS_ID, PANEL_LAYOUT_ID } from "@feedzero/core/utils/constants";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { HeaderBreadcrumbs } from "@/components/layout/header-breadcrumbs.tsx";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer.tsx";
import { MobileHeaderPills } from "@/components/articles/article-list-controls.tsx";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge.tsx";

/**
 * Listens for the feedzero:toggle-sidebar event and toggles the sidebar.
 * Must be rendered inside SidebarProvider.
 */
function SidebarKeyboardToggle() {
  const { toggleSidebar } = useSidebar();
  useEffect(() => {
    const handler = () => toggleSidebar();
    document.addEventListener("feedzero:toggle-sidebar", handler);
    return () =>
      document.removeEventListener("feedzero:toggle-sidebar", handler);
  }, [toggleSidebar]);
  return null;
}

/**
 * Decides what bare `/feeds` (no feedId) should show:
 *
 *   0 or 1 feeds  → /explore (starter mode — the one feed is typically
 *                   just the auto-subscribed release feed, so we show
 *                   the catalog instead of a one-feed list)
 *   2+ feeds      → /feeds/all (returning user — aggregate view)
 *
 * `feedsLoaded` gates the redirect so we don't fire with feeds=[] during
 * the brief window between mount and loadFeeds() resolving. Without it,
 * a returning multi-feed user would land on /explore briefly and then
 * get stuck there once isExplorePage flipped true.
 */
function useDefaultFeedsRedirect() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { feedId } = useParams();
  const feedsLoaded = useFeedStore((s) => s.feedsLoaded);
  const feedCount = useFeedStore((s) => s.feeds.length);
  const isFeedsRoot = pathname === "/feeds" && !feedId;

  useEffect(() => {
    if (!isFeedsRoot) return;
    if (!feedsLoaded) return;
    if (feedCount <= 1) {
      navigate({ pathname: "/explore", search }, { replace: true });
      return;
    }
    navigate(
      { pathname: `/feeds/${ALL_FEEDS_ID}`, search },
      { replace: true },
    );
  }, [isFeedsRoot, feedsLoaded, feedCount, navigate, search]);
}

/**
 * Shell that hosts every primary route: feeds, explore, stats, settings.
 *
 * Desktop: two-tier ResizablePanelGroup model.
 *
 *   OUTER group (id = MAIN): [sidebar | stage] — constant on every route.
 *   STAGE content swaps via React Router's <Outlet />.
 *
 * The outer group's child set never changes, so react-resizable-panels
 * can't recompute layout when the route changes — that's what made the
 * sidebar visibly resize on every navigation (ADR 013). The sidebar's
 * neighbour (the stage) is always the same panel; its inner content is
 * none of the library's business.
 *
 * Mobile: single panel with a header, the route's content in `<main>`,
 * and a persistent bottom drawer for feed navigation.
 */
export function AppLayout() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const { feedId } = useParams();
  useKeyboardNav();
  useAutoRefresh();
  useBriefingAutoRefresh();
  useLicenseRefresh();
  useSignalMidnightRefresh();
  useDefaultFeedsRedirect();

  function handleFeedSelect(id: string) {
    navigate(`/feeds/${id}`);
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 z-10 bg-background">
          <HeaderBreadcrumbs fallback={feedId ? "Articles" : "Feeds"} />
          <MobileHeaderPills />
          <SyncStatusBadge />
        </header>
        <Outlet />
        <MobileNavDrawer onFeedSelect={handleFeedSelect} />
      </div>
    );
  }

  return <DesktopShell onFeedSelect={handleFeedSelect} />;
}

function DesktopShell({ onFeedSelect }: { onFeedSelect: (id: string) => void }) {
  const layoutId = PANEL_LAYOUT_ID.MAIN;
  const sidebarSize = useSharedSidebarSize();

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <SidebarKeyboardToggle />
      <ResizablePanelGroup
        id={layoutId}
        direction="horizontal"
        className="h-svh"
      >
        <ResizablePanel
          id="sidebar"
          defaultSize={sidebarSize.defaultSize ?? "256px"}
          minSize="150px"
          maxSize="280px"
          className="overflow-hidden"
          onResize={sidebarSize.onResize}
        >
          <AppSidebar
            collapsible="none"
            className="w-full h-full"
            onFeedSelect={onFeedSelect}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="stage" className="overflow-hidden">
          <Outlet />
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
