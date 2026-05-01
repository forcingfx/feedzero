import { useState, useEffect, useRef, type RefObject } from "react";

/** Height of the pull zone appended below article content. Must match the DOM element. */
export const PULL_ZONE_HEIGHT = 80;

/** Minimum downward pull (px) from scrollTop=0 to navigate to the previous article. */
const TOP_THRESHOLD = 80;

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}

interface PullState {
  /** 0-1 — how far the user has scrolled into the bottom pull zone. */
  bottomProgress: number;
  /** px the user has pulled downward from the top of the scroll container. */
  topPullPx: number;
}

/**
 * Tracks two pull-to-advance gestures on a mobile scroll container:
 *
 * • Bottom: as the user scrolls past the article end into the pull zone
 *   (a DOM element PULL_ZONE_HEIGHT px tall appended after the content),
 *   bottomProgress rises 0→1. On scrollend at full depth, onNext fires;
 *   on partial pull, the container snaps back to the article end.
 *
 * • Top: when the user is at scrollTop=0 and drags down, topPullPx rises.
 *   On touchend past TOP_THRESHOLD, onPrev fires; otherwise resets.
 */
export function usePullToAdvance({
  scrollRef,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
}: Options): PullState {
  const [bottomProgress, setBottomProgress] = useState(0);
  const [topPullPx, setTopPullPx] = useState(0);

  // Refs for values read inside event handlers (avoid stale closures)
  const bottomProgressRef = useRef(0);
  const topPullPxRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isPullingTopRef = useRef(false);

  // Bottom: scroll events
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasNext) return;

    function handleScroll() {
      const el = scrollRef.current;
      if (!el) return;
      const overscroll = el.scrollTop + el.clientHeight - (el.scrollHeight - PULL_ZONE_HEIGHT);
      const progress = Math.min(1, Math.max(0, overscroll / PULL_ZONE_HEIGHT));
      bottomProgressRef.current = progress;
      setBottomProgress(progress);
    }

    function handleScrollEnd() {
      const el = scrollRef.current;
      if (!el) return;
      if (bottomProgressRef.current >= 1) {
        onNext();
      } else if (bottomProgressRef.current > 0) {
        // Rubber-band: snap back to just before the pull zone
        el.scrollTo({ top: el.scrollHeight - el.clientHeight - PULL_ZONE_HEIGHT, behavior: "smooth" });
      }
      bottomProgressRef.current = 0;
      setBottomProgress(0);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("scrollend", handleScrollEnd, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [scrollRef, hasNext, onNext]);

  // Top: touch events
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasPrev) return;

    function handleTouchStart(e: TouchEvent) {
      if (el!.scrollTop > 0) return;
      touchStartYRef.current = e.touches[0].clientY;
      isPullingTopRef.current = true;
    }

    function handleTouchMove(e: TouchEvent) {
      if (!isPullingTopRef.current) return;
      const dy = e.touches[0].clientY - touchStartYRef.current;
      if (dy > 0) {
        topPullPxRef.current = Math.min(TOP_THRESHOLD * 1.5, dy);
        setTopPullPx(topPullPxRef.current);
      } else {
        isPullingTopRef.current = false;
        topPullPxRef.current = 0;
        setTopPullPx(0);
      }
    }

    function handleTouchEnd() {
      if (isPullingTopRef.current && topPullPxRef.current >= TOP_THRESHOLD) {
        onPrev();
      }
      isPullingTopRef.current = false;
      topPullPxRef.current = 0;
      setTopPullPx(0);
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [scrollRef, hasPrev, onPrev]);

  return { bottomProgress, topPullPx };
}
