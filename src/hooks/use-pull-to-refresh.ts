import { useEffect, useRef, useState, type RefObject } from "react";

/** Minimum downward pull (px) from scrollTop=0 to fire onRefresh. */
const TOP_THRESHOLD = 70;

/** Maximum visual pull shown to the user. */
const MAX_PULL = 120;

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Disable the gesture (e.g. desktop). */
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
}

interface PullState {
  /** px the user has pulled downward from the top of the scroll container. */
  pullPx: number;
  /** True while the onRefresh promise is in flight. */
  isRefreshing: boolean;
}

/**
 * Pull-to-refresh gesture for a scroll container. When the user is at
 * scrollTop=0 and drags down past TOP_THRESHOLD, onRefresh fires on
 * touchend. Releases below the threshold reset visually with no action.
 *
 * The hook only listens to touch events — desktop keeps the explicit
 * Refresh button. Pass `enabled: false` to disable.
 */
export function usePullToRefresh({ scrollRef, enabled, onRefresh }: Options): PullState {
  const [pullPx, setPullPx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartYRef = useRef(0);
  const isPullingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      if (!el || el.scrollTop > 0) return;
      touchStartYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }

    function handleTouchMove(e: TouchEvent) {
      if (!el || !isPullingRef.current) return;
      // If the user scrolled away from the top during the drag, abandon.
      if (el.scrollTop > 0) {
        isPullingRef.current = false;
        setPullPx(0);
        return;
      }
      const delta = e.touches[0].clientY - touchStartYRef.current;
      if (delta <= 0) {
        setPullPx(0);
        return;
      }
      // Resist past MAX_PULL so the user knows they've reached the ceiling.
      setPullPx(Math.min(delta, MAX_PULL));
    }

    async function handleTouchEnd() {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      const fired = pullPx >= TOP_THRESHOLD;
      setPullPx(0);
      if (fired) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scrollRef, enabled, onRefresh, pullPx]);

  return { pullPx, isRefreshing };
}
