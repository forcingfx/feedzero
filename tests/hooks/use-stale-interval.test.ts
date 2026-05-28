/**
 * useStaleInterval — the timer + focus/visibility pattern that
 * useAutoRefresh and useLicenseRefresh both grew independently. Each
 * hook owned its own setInterval, its own focus listener, its own
 * "skip while offline" check, and its own "skip if last run was
 * recent enough" guard. The duplication wasn't dangerous, but it
 * made the next "background hygiene timer we add" land as a third
 * copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStaleInterval } from "@/hooks/use-stale-interval";

const INTERVAL_MS = 60 * 1000;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useStaleInterval", () => {
  let run: ReturnType<typeof vi.fn>;
  let lastAt: number | null;

  beforeEach(() => {
    vi.useFakeTimers();
    run = vi.fn().mockResolvedValue(undefined);
    lastAt = null;
    setOnline(true);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires `run` on the interval tick", () => {
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not fire on the interval tick while offline", () => {
    setOnline(false);
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(run).not.toHaveBeenCalled();
  });

  it("fires on focus when lastAt is null (never run this session)", () => {
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );

    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires on focus when lastAt is older than the interval", () => {
    lastAt = Date.now() - INTERVAL_MS - 1;
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );

    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire on focus when lastAt is still fresh", () => {
    lastAt = Date.now();
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );

    window.dispatchEvent(new Event("focus"));
    expect(run).not.toHaveBeenCalled();
  });

  it("does NOT fire on visibilitychange while the tab is hidden", () => {
    setVisibility("hidden");
    renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );

    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).not.toHaveBeenCalled();
  });

  it("tears down its timer and listeners on unmount", () => {
    const { unmount } = renderHook(() =>
      useStaleInterval({
        run,
        lastAt: () => lastAt,
        intervalMs: INTERVAL_MS,
      }),
    );
    unmount();

    vi.advanceTimersByTime(INTERVAL_MS * 2);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).not.toHaveBeenCalled();
  });
});
