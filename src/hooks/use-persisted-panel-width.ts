import { useCallback, useRef } from "react";
import type { PanelSize } from "react-resizable-panels";

/**
 * Why pixels and not percentages: a percentage re-evaluates against
 * whatever viewport is active on reload, so the panel silently drifts
 * whenever the app opens at a different window size than the user dragged
 * it at. Pixels reproduce the width the user chose.
 */
function readStored(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded).
    // The in-memory ref still serves the current session.
  }
}

export interface PersistedPanelWidth {
  onResize: (panelSize: PanelSize) => void;
  defaultSize: string | undefined;
}

/**
 * Persists a resizable panel's user-dragged pixel width across reloads.
 *
 * Returns a `defaultSize` (px-suffixed string, so react-resizable-panels
 * parses it as pixels) read once at mount, plus an `onResize` callback the
 * panel calls whenever the user drags its handle. `defaultSize` is
 * `undefined` when nothing valid is stored, so the caller's own fallback
 * applies.
 */
export function usePersistedPanelWidth(storageKey: string): PersistedPanelWidth {
  const sizeRef = useRef<number | null>(readStored(storageKey));

  const onResize = useCallback(
    (panelSize: PanelSize) => {
      sizeRef.current = panelSize.inPixels;
      writeStored(storageKey, panelSize.inPixels);
    },
    [storageKey],
  );

  const initial = sizeRef.current;
  return {
    onResize,
    defaultSize: initial != null ? `${initial}px` : undefined,
  };
}
