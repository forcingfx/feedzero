import { useEffect, useState, type RefObject } from "react";

/** Scroll distance before a direction counts; smaller moves are finger jitter. */
const SLOP_PX = 12;
/** Nothing hides this close to the top: the user is still orienting. */
const TOP_ZONE_PX = 48;

/**
 * Whether a scroller is moving down (true) or up / at rest (false).
 *
 * Drives chrome that steps out of the way while reading and returns on
 * the first scroll up, the pattern Safari, Reeder and Kindle settled on.
 * Reads `scroll` events only, never touch events, so the browser's own
 * scroll recogniser is left alone (CLAUDE.md, Gesture work).
 */
export function useScrollingDown(ref: RefObject<HTMLElement | null>): boolean {
  const [down, setDown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.scrollTop;
    function onScroll() {
      const top = el!.scrollTop;
      const delta = top - last;
      if (Math.abs(delta) < SLOP_PX) return;
      last = top;
      setDown(delta > 0 && top > TOP_ZONE_PX);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return down;
}
