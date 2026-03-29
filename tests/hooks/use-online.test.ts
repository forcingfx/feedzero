import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsOnline } from "@/hooks/use-online";

describe("useIsOnline", () => {
  let listeners: Record<string, (() => void)[]>;

  beforeEach(() => {
    listeners = { online: [], offline: [] };
    vi.spyOn(window, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event in listeners)
          listeners[event].push(handler as () => void);
      },
    );
    vi.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it("updates when going offline", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => {
      listeners.offline.forEach((fn) => fn());
    });
    expect(result.current).toBe(false);
  });

  it("updates when coming back online", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);

    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => {
      listeners.online.forEach((fn) => fn());
    });
    expect(result.current).toBe(true);
  });
});
