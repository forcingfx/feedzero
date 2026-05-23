import { useEffect } from "react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { AUTO_REFRESH_INTERVAL_MS } from "@feedzero/core/utils/constants";

/**
 * Keeps an open tab's feeds fresh without user action.
 *
 * Two triggers, one threshold (AUTO_REFRESH_INTERVAL_MS):
 *  - a background timer refreshes every feed on each interval
 *  - returning focus to a tab that's been idle longer than the interval
 *    refreshes immediately rather than waiting out the remainder
 *
 * Reads the store via getState() inside the handlers so the effect can
 * run once (empty deps) and never re-subscribe — refreshAll already
 * no-ops while a refresh is in flight, so overlapping triggers are safe.
 *
 * Mount once, inside the authenticated app shell (AppLayout), so it only
 * runs after the DB is ready.
 */
export function useAutoRefresh() {
  useEffect(() => {
    function refreshNow() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      // Pass respectBackoff so quiet feeds (publishers who've returned
      // 304 Not Modified at least three times in a row) get skipped this
      // pass. The user clicking the explicit "Refresh All" button or
      // hitting `r` calls refreshAll() without options and bypasses
      // the gate.
      void useFeedStore.getState().refreshAll({
        respectBackoff: true,
        intervalMs: AUTO_REFRESH_INTERVAL_MS,
      });
    }

    const timer = setInterval(refreshNow, AUTO_REFRESH_INTERVAL_MS);

    function refreshIfStale() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const last = useFeedStore.getState().lastRefreshAllAt;
      if (last !== null && Date.now() - last < AUTO_REFRESH_INTERVAL_MS) return;
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
