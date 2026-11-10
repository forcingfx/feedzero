import { useEffect, useState, type RefObject } from "react";

/** Scroll distance before a direction counts; smaller moves are finger jitter. */
export const SLOP_PX = 12;
/** Nothing hides this close to the top: the user is still orienting. */
export const TOP_ZONE_PX = 48;

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

/** Scrolling in these surfaces never minimizes the tab bar. */
const MINIMIZE_IGNORES = "[data-reader-layer], [data-vaul-drawer], [role='dialog']";

/**
 * Whether the tab bar is minimized, per Apple's HIG for iOS tab bars: it
 * minimizes while content scrolls down and comes back when content
 * scrolls up or the minimized tab is tapped (the returned setter).
 *
 * Listens for `scroll` in the capture phase on the document, so any page's
 * scroller drives it without plumbing; scroll events do not bubble, but
 * they do pass through capture. Scroll events only, never touch events
 * (CLAUDE.md, Gesture work). Resets to expanded whenever `resetKey`
 * changes, so a new section always shows its tabs.
 */
export function useMinimizeOnScroll(resetKey: string): [boolean, (minimized: boolean) => void] {
  const [minimized, setMinimized] = useState(false);

  useEffect(() => setMinimized(false), [resetKey]);

  useEffect(() => {
    const lastTop = new WeakMap<Element, number>();
    function onScroll(event: Event) {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el.closest(MINIMIZE_IGNORES)) return;
      const top = el.scrollTop;
      const delta = top - (lastTop.get(el) ?? 0);
      if (Math.abs(delta) < SLOP_PX) return;
      lastTop.set(el, top);
      setMinimized(delta > 0 && top > TOP_ZONE_PX);
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return [minimized, setMinimized];
}
