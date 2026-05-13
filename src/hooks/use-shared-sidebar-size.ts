import { useCallback, useEffect, useRef } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";

/**
 * localStorage key used to persist the sidebar's preferred width across
 * layout transitions and reloads. Stored as a percentage string (0..100).
 */
export const SIDEBAR_SIZE_STORAGE_KEY = "feedzero:sidebar-size";

function readStored(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_SIZE_STORAGE_KEY);
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
    window.localStorage.setItem(SIDEBAR_SIZE_STORAGE_KEY, String(value));
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
 * Synchronizes the sidebar panel's width across distinct ResizablePanelGroup
 * ids (e.g. the 3-panel feeds layout and the 2-panel explore/stats layout).
 *
 * react-resizable-panels persists panel sizes per group id, so with separate
 * ids switching layouts resets the sidebar to its `defaultSize` even when the
 * user resized it in the other layout. This hook stores the user's preferred
 * width in localStorage so both layouts agree on it, and imperatively
 * re-applies the width whenever `layoutKey` changes — the library otherwise
 * rebalances proportions when conditionally-rendered panels appear or disappear.
 */
export function useSharedSidebarSize(layoutKey: string): UseSharedSidebarSizeResult {
  const sizeRef = useRef<number | null>(readStored());
  const panelRef = useRef<PanelImperativeHandle | null>(null);

  const onResize = useCallback((panelSize: PanelSize) => {
    sizeRef.current = panelSize.asPercentage;
    writeStored(panelSize.asPercentage);
  }, []);

  useEffect(() => {
    const stored = sizeRef.current;
    if (stored == null) return;
    const handle = panelRef.current;
    if (!handle) return;
    handle.resize(stored);
  }, [layoutKey]);

  const initial = sizeRef.current;
  return {
    panelRef,
    onResize,
    defaultSize: initial != null ? `${initial}%` : undefined,
  };
}
