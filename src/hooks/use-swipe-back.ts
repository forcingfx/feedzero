import { useEffect, useRef, useState, type RefObject } from "react";

/** Width of the left-edge zone (px) where a back-swipe may begin. */
const EDGE_ZONE = 28;
/** Movement (px) before we decide whether the gesture is ours. */
const ARM_SLOP = 10;
/** Fallback commit distance when the element width is unknown. */
const COMMIT_MIN = 96;

interface Options {
  ref: RefObject<HTMLElement | null>;
  enabled: boolean;
  onBack: () => void;
}

/**
 * iOS-style edge-swipe-back for an overlay layer: a rightward drag that
 * STARTS in the left edge zone follows the finger (`dragX`) and commits
 * `onBack` when released past a third of the layer width. Drags starting
 * anywhere else belong to the layer's content (vertical scroll,
 * horizontally scrollable code blocks) and are never intercepted.
 *
 * touchmove is registered non-passive so an armed drag can
 * preventDefault() browser panning — React's root touch listeners are
 * passive, so this cannot be done with synthetic handlers.
 */
export function useSwipeBack({ ref, enabled, onBack }: Options): {
  dragX: number;
} {
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    armed: boolean;
    aborted: boolean;
  } | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    function setDrag(value: number) {
      dragXRef.current = value;
      setDragX(value);
    }

    function handleStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_ZONE) {
        gestureRef.current = null;
        return;
      }
      gestureRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        armed: false,
        aborted: false,
      };
    }

    function handleMove(e: TouchEvent) {
      const g = gestureRef.current;
      const t = e.touches[0];
      if (!g || g.aborted || !t) return;
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;

      if (!g.armed) {
        if (Math.abs(dx) < ARM_SLOP && Math.abs(dy) < ARM_SLOP) return;
        if (dx > 0 && dx > Math.abs(dy)) {
          g.armed = true;
        } else {
          g.aborted = true;
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      setDrag(Math.max(0, dx));
    }

    function handleEnd() {
      const g = gestureRef.current;
      gestureRef.current = null;
      const width = el?.clientWidth ?? 0;
      const threshold = width > 0 ? Math.min(COMMIT_MIN, width / 3) : COMMIT_MIN;
      const commit = Boolean(g?.armed) && dragXRef.current >= threshold;
      setDrag(0);
      if (commit) onBackRef.current();
    }

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchmove", handleMove, { passive: false });
    el.addEventListener("touchend", handleEnd);
    el.addEventListener("touchcancel", handleEnd);
    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
  }, [ref, enabled]);

  return { dragX };
}
