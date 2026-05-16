import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Threshold for the 3-panel desktop reading layout.
 *
 * The desktop layout in `feeds-page.tsx` has minSize floors of
 * sidebar=150px + article-list=180px + reader=200px = 530px. Below ~1024px
 * the 3 panels are cramped enough that mobile snap-scroll navigation is
 * a better UX — and below ~600px the layout outright fails because the
 * library shrinks panels below their `minSize` and `overflow-hidden` blanks
 * the canvas.
 *
 * Pinned to Tailwind `lg` so the JS breakpoint matches the design system's
 * laptop-and-up assumption. See PR F for the canvas-blank-on-narrow-resize
 * fix this guards.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
