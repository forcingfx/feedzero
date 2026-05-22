import { useEffect } from "react";
import { useLicenseStore } from "@/stores/license-store.ts";
import { LICENSE_RECHECK_INTERVAL_MS } from "@/utils/constants.ts";

/**
 * Re-verifies the license token against the server while a tab stays open.
 *
 * Boot (app.tsx) and cross-tab storage events already re-resolve the tier,
 * but a tab left open for days never reboots — so a subscription revoked
 * mid-session would keep its paid tier until the next reload. Two triggers,
 * one threshold (LICENSE_RECHECK_INTERVAL_MS):
 *  - a background timer re-verifies once a day
 *  - returning focus to a tab whose last definitive check is older than the
 *    interval re-verifies immediately, catching a machine that slept (which
 *    suspends the timer) rather than waiting out a fresh full day
 *
 * Reads the store via getState() inside the handlers so the effect runs
 * once (empty deps) and never re-subscribes. refresh() handles its own
 * transient-failure tolerance, so overlapping triggers are safe.
 *
 * Mount once, inside the authenticated app shell (AppLayout), alongside
 * useAutoRefresh.
 */
export function useLicenseRefresh() {
  useEffect(() => {
    function refreshNow() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void useLicenseStore.getState().refresh();
    }

    const timer = setInterval(refreshNow, LICENSE_RECHECK_INTERVAL_MS);

    function refreshIfStale() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const last = useLicenseStore.getState().lastCheckedAt;
      if (last !== null && Date.now() - last < LICENSE_RECHECK_INTERVAL_MS) return;
      refreshNow();
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, []);
}
