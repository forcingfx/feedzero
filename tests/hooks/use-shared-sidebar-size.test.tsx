import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSharedSidebarSize,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/hooks/use-shared-sidebar-size.ts";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("useSharedSidebarSize", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("returns no defaultSize when nothing is stored", () => {
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    expect(result.current.defaultSize).toBeUndefined();
  });

  it("reads the stored sidebar width in pixels and exposes it as a px-suffixed defaultSize", () => {
    // The hook stores absolute pixels so the sidebar's width survives changes
    // in viewport size (a percentage-based store would re-evaluate against
    // the new viewport, producing a different pixel width than the user
    // dragged). The returned defaultSize is a px-suffixed string so
    // react-resizable-panels parses it as pixels (see its bt() unit parser).
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "250");
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    expect(result.current.defaultSize).toBe("250px");
  });

  it("ignores the legacy percentage storage key on read (silent reset for existing users)", () => {
    // Pre-PR-J users had `feedzero:sidebar-size` populated with a percentage
    // value. After the switch to pixel storage that value is meaningless;
    // the hook must not try to migrate or coerce it. It just looks at the
    // new key, which is empty, so defaultSize is undefined and the page's
    // own fallback applies.
    window.localStorage.setItem("feedzero:sidebar-size", "17");
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    expect(result.current.defaultSize).toBeUndefined();
  });

  it("persists the new width as pixels (inPixels) when onResize is called", () => {
    // PanelSize from react-resizable-panels carries both asPercentage and
    // inPixels. We store inPixels so the next reload reproduces the exact
    // pixel width the user dragged, independent of viewport.
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    act(() => {
      result.current.onResize({ asPercentage: 19.5, inPixels: 240 });
    });
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("240");
  });

  it("re-applies the remembered width as a px-suffixed string when layoutKey changes", () => {
    // The library's imperative resize() accepts either a number (pixels) or
    // a string with units. Passing "240px" makes the unit explicit so any
    // future refactor of the library's number-default can't silently flip
    // our intent.
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "240");
    const resize = vi.fn();
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useSharedSidebarSize(key),
      { initialProps: { key: "feeds" } },
    );
    result.current.panelRef.current = {
      resize,
      collapse: vi.fn(),
      expand: vi.fn(),
      getSize: vi.fn(() => ({ asPercentage: 19.5, inPixels: 240 })),
      isCollapsed: vi.fn(() => false),
    };
    rerender({ key: "explore" });
    expect(resize).toHaveBeenCalledWith("240px");
  });

  it("does not call resize when nothing has been stored yet", () => {
    const resize = vi.fn();
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useSharedSidebarSize(key),
      { initialProps: { key: "feeds" } },
    );
    result.current.panelRef.current = {
      resize,
      collapse: vi.fn(),
      expand: vi.fn(),
      getSize: vi.fn(() => ({ asPercentage: 17, inPixels: 170 })),
      isCollapsed: vi.fn(() => false),
    };
    rerender({ key: "explore" });
    expect(resize).not.toHaveBeenCalled();
  });
});
