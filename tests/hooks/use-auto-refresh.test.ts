/**
 * useAutoRefresh — background freshness for an open tab.
 *
 * Behaviour under test (all user-observable through refreshAll):
 *   - fires refreshAll on the AUTO_REFRESH_INTERVAL_MS timer
 *   - refreshes on tab focus when the corpus is stale (last refresh
 *     older than the interval)
 *   - does NOT refresh on focus when feeds are still fresh
 *   - skips refresh while offline
 *   - tears down its timer and listeners on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { AUTO_REFRESH_INTERVAL_MS } from "@feedzero/core/utils/constants";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useAutoRefresh", () => {
  let refreshAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    refreshAll = vi.fn().mockResolvedValue(undefined);
    useFeedStore.setState({ refreshAll, lastRefreshAllAt: null });
    setOnline(true);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes all feeds when the interval elapses", () => {
    renderHook(() => useAutoRefresh());
    expect(refreshAll).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS);
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on the timer while offline", () => {
    setOnline(false);
    renderHook(() => useAutoRefresh());

    vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS);
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it("refreshes on focus when the corpus is stale", () => {
    useFeedStore.setState({
      lastRefreshAllAt: Date.now() - AUTO_REFRESH_INTERVAL_MS - 1,
    });
    renderHook(() => useAutoRefresh());

    window.dispatchEvent(new Event("focus"));
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on focus when the corpus is still fresh", () => {
    useFeedStore.setState({ lastRefreshAllAt: Date.now() });
    renderHook(() => useAutoRefresh());

    window.dispatchEvent(new Event("focus"));
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it("stops refreshing after unmount", () => {
    const { unmount } = renderHook(() => useAutoRefresh());
    unmount();

    vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS * 2);
    window.dispatchEvent(new Event("focus"));
    expect(refreshAll).not.toHaveBeenCalled();
  });
});
