import { useLicenseStore } from "@/stores/license-store.ts";
import { useStaleInterval } from "@/hooks/use-stale-interval.ts";
import { LICENSE_RECHECK_INTERVAL_MS } from "@feedzero/core/utils/constants";

/**
 * Re-verifies the license token against the server while a tab stays open.
 *
 * Boot (app.tsx) and cross-tab storage events already re-resolve the tier,
 * but a tab left open for days never reboots — so a subscription revoked
 * mid-session would keep its paid tier until the next reload. The shared
 * {@link useStaleInterval} pattern fires `refresh()` on the daily timer
 * and on focus when the last definitive check is older than the interval
 * (catches the laptop-asleep case where setInterval is suspended).
 *
 * refresh() handles its own transient-failure tolerance, so overlapping
 * triggers are safe.
 *
 * Mount once, inside the authenticated app shell (AppLayout), alongside
 * useAutoRefresh.
 */
export function useLicenseRefresh() {
  useStaleInterval({
    run: () => useLicenseStore.getState().refresh(),
    lastAt: () => useLicenseStore.getState().lastCheckedAt,
    intervalMs: LICENSE_RECHECK_INTERVAL_MS,
  });
}
