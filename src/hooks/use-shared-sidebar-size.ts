import { useCallback, useRef } from "react";
import type { PanelSize } from "react-resizable-panels";

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
  onResize: (panelSize: PanelSize) => void;
  defaultSize: string | undefined;
}

/**
 * Persists the sidebar's user-dragged pixel width across reloads.
 *
 * Returns a `defaultSize` (px-suffixed string for react-resizable-panels)
 * read once at mount, plus an `onResize` callback the panel calls every
 * time the user drags the handle.
 *
 * ADR 013 made the outer panel topology constant across routes, so
 * react-resizable-panels' own per-id persistence preserves the sidebar
 * width on navigation. The imperative `panelRef.resize()` safety net the
 * hook used to ship was deleted in the ADR 013 follow-up — keeping it
 * would have given the false impression that the rule "the sidebar
 * width only changes when the user drags or resizes the window" was held
 * by correction rather than by construction.
 */
export function useSharedSidebarSize(): UseSharedSidebarSizeResult {
  const sizeRef = useRef<number | null>(readStored());

  const onResize = useCallback((panelSize: PanelSize) => {
    sizeRef.current = panelSize.inPixels;
    writeStored(panelSize.inPixels);
  }, []);

  const initial = sizeRef.current;
  return {
    onResize,
    defaultSize: initial != null ? `${initial}px` : undefined,
  };
}
