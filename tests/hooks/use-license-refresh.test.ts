/**
 * useLicenseRefresh — daily license re-verification for an open tab.
 *
 * Behaviour under test (all user-observable through the store's refresh):
 *   - fires refresh on the LICENSE_RECHECK_INTERVAL_MS timer
 *   - re-verifies on tab focus when the last check is stale (older than
 *     the interval) — catches a slept laptop whose timer was suspended
 *   - does NOT re-verify on focus when the last check is still fresh
 *   - skips while offline
 *   - tears down its timer and listeners on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLicenseRefresh } from "@/hooks/use-license-refresh.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { LICENSE_RECHECK_INTERVAL_MS } from "@/utils/constants.ts";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("useLicenseRefresh", () => {
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    refresh = vi.fn().mockResolvedValue(undefined);
    useLicenseStore.setState({ refresh, lastCheckedAt: null });
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("re-verifies the license when the interval elapses", () => {
    renderHook(() => useLicenseRefresh());
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(LICENSE_RECHECK_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not re-verify on the timer while offline", () => {
    setOnline(false);
    renderHook(() => useLicenseRefresh());

    vi.advanceTimersByTime(LICENSE_RECHECK_INTERVAL_MS);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-verifies on focus when the last check is stale", () => {
    useLicenseStore.setState({
      lastCheckedAt: Date.now() - LICENSE_RECHECK_INTERVAL_MS - 1,
    });
    renderHook(() => useLicenseRefresh());

    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not re-verify on focus when the last check is still fresh", () => {
    useLicenseStore.setState({ lastCheckedAt: Date.now() });
    renderHook(() => useLicenseRefresh());

    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops re-verifying after unmount", () => {
    const { unmount } = renderHook(() => useLicenseRefresh());
    unmount();

    vi.advanceTimersByTime(LICENSE_RECHECK_INTERVAL_MS * 2);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
