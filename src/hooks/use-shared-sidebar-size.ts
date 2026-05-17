import { useCallback, useEffect, useRef } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";

/**
 * localStorage key for the sidebar's preferred width in absolute pixels.
 *
 * Stored as a bare integer string (e.g. "240"). The hook appends "px" when
 * handing the value to react-resizable-panels so the library parses it
 * unambiguously as pixels (see its bt() unit parser).
 *
 * Why pixels and not percentages: a percentage-based store re-evaluates the
 * stored value against whatever viewport happens to be active on reload,
 * which silently drifts the sidebar width whenever the user opens the app
 * at a different window size than they dragged it at. Pixels are stable.
 *
 * Existing users had a percentage in the prior key `feedzero:sidebar-size`
 * (deliberately a different key). Those values are not migrated; existing
 * users get a one-time silent reset to the page's default.
 */
export const SIDEBAR_WIDTH_STORAGE_KEY = "feedzero:sidebar-width-px";

function readStored(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

function writeStored(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(value));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded).
    // The in-memory ref still serves the current session.
  }
}

interface UseSharedSidebarSizeResult {
  panelRef: React.MutableRefObject<PanelImperativeHandle | null>;
  onResize: (panelSize: PanelSize) => void;
  defaultSize: string | undefined;
}

/**
 * Persists the sidebar's user-dragged pixel width across reloads and across
 * layout transitions that may remount the panel group (HMR, SidebarProvider
 * remount).
 *
 * The imperative panelRef.resize() on layoutKey change is a safety net for
 * remount paths; the outer panel group's child set is constant across
 * routes (PR #103) so the library's own layout reconciliation no longer
 * rebalances the sidebar on navigation.
 */
export function useSharedSidebarSize(layoutKey: string): UseSharedSidebarSizeResult {
  const sizeRef = useRef<number | null>(readStored());
  const panelRef = useRef<PanelImperativeHandle | null>(null);

  const onResize = useCallback((panelSize: PanelSize) => {
    sizeRef.current = panelSize.inPixels;
    writeStored(panelSize.inPixels);
  }, []);

  useEffect(() => {
    const stored = sizeRef.current;
    if (stored == null) return;
    const handle = panelRef.current;
    if (!handle) return;
    handle.resize(`${stored}px`);
  }, [layoutKey]);

  const initial = sizeRef.current;
  return {
    panelRef,
    onResize,
    defaultSize: initial != null ? `${initial}px` : undefined,
  };
}
