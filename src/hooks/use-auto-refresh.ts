import { useFeedStore } from "@/stores/feed-store.ts";
import { useStaleInterval } from "@/hooks/use-stale-interval.ts";
import { AUTO_REFRESH_INTERVAL_MS } from "@feedzero/core/utils/constants";

/**
 * Keeps an open tab's feeds fresh without user action.
 *
 * Routes through the shared {@link useStaleInterval} pattern (timer +
 * focus-when-stale + offline-skip). The auto-refresh path passes
 * `respectBackoff` so quiet feeds (publishers who've returned 304 Not
 * Modified at least three times in a row) get skipped this pass. The
 * user clicking the explicit "Refresh All" button or hitting `r`
 * calls refreshAll() without options and bypasses the gate.
 *
 * Mount once, inside the authenticated app shell (AppLayout), so it
 * only runs after the DB is ready.
 */
export function useAutoRefresh() {
  useStaleInterval({
    run: () =>
      useFeedStore.getState().refreshAll({
        respectBackoff: true,
        intervalMs: AUTO_REFRESH_INTERVAL_MS,
      }),
    lastAt: () => useFeedStore.getState().lastRefreshAllAt,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
  });
}
