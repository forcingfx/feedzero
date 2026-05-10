import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSharedSidebarSize,
  SIDEBAR_SIZE_STORAGE_KEY,
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

  it("reads the stored sidebar size on first mount and exposes it as defaultSize", () => {
    window.localStorage.setItem(SIDEBAR_SIZE_STORAGE_KEY, "25");
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    expect(result.current.defaultSize).toBe("25%");
  });

  it("persists the new size to localStorage when onResize is called", () => {
    const { result } = renderHook(() => useSharedSidebarSize("feeds"));
    act(() => {
      result.current.onResize({ asPercentage: 22, inPixels: 220 });
    });
    expect(window.localStorage.getItem(SIDEBAR_SIZE_STORAGE_KEY)).toBe("22");
  });

  it("re-applies the remembered size to the panel when layoutKey changes", () => {
    window.localStorage.setItem(SIDEBAR_SIZE_STORAGE_KEY, "25");
    const resize = vi.fn();
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useSharedSidebarSize(key),
      { initialProps: { key: "feeds" } },
    );
    // Simulate the panel being mounted by attaching the imperative handle.
    result.current.panelRef.current = {
      resize,
      collapse: vi.fn(),
      expand: vi.fn(),
      getSize: vi.fn(() => ({ asPercentage: 25, inPixels: 250 })),
      isCollapsed: vi.fn(() => false),
    };
    // Now switch layout. The sidebar's stored size must be re-applied so that
    // the library's rebalancing on conditional-panel changes does not silently
    // override the user's preference.
    rerender({ key: "explore" });
    expect(resize).toHaveBeenCalledWith(25);
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
