/**
 * useIsDesktop — picks between the 3-panel desktop layout and the single-panel
 * mobile layout. The breakpoint is load-bearing: too low and the desktop
 * layout tries to fit in a window that's narrower than its minimum total
 * width (sidebar 150 + article-list 180 + reader 200 = 530px), causing
 * `overflow-hidden` to clip content and the canvas to go blank.
 *
 * The breakpoint must be at least `the sum of minSize values + handle gutters`
 * — but more importantly, it should match the visual reading experience
 * threshold. Below ~1024px (a typical small-laptop width), a 3-panel reader
 * is cramped enough that mobile-snap navigation is a better UX.
 *
 * Pinned at 1024px (Tailwind `lg`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsDesktop } from "@/hooks/use-media-query";

function mockMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("useIsDesktop", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("uses the (min-width: 1024px) breakpoint, not 768px", () => {
    let observedQuery = "";
    mockMatchMedia((query) => {
      observedQuery = query;
      return false;
    });
    renderHook(() => useIsDesktop());
    expect(observedQuery).toBe("(min-width: 1024px)");
  });

  it("returns false below 1024px (so mobile layout activates and prevents canvas-blank)", () => {
    mockMatchMedia(() => false); // window is narrow
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("returns true at 1024px or wider (3-panel desktop layout viable)", () => {
    mockMatchMedia(() => true); // window is wide
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });
});
