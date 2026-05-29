import { useEffect } from "react";

/**
 * The "keep this background hygiene task fresh while a tab is open"
 * pattern.
 *
 * Two triggers, one threshold:
 *  - a background timer fires the task on each interval
 *  - returning focus to a tab whose last task is older than the
 *    interval fires it immediately rather than waiting out the
 *    remainder (catches the laptop-asleep case where setInterval
 *    is suspended through the scheduled time)
 *
 * Both triggers skip while offline. The visibility check skips
 * `visibilitychange` events that fire while the tab is hidden — we
 * only catch up *as* the user returns, not when they leave.
 *
 * Reads `lastAt` via the supplied getter (not a closure) so callers
 * can read it from a Zustand store via `getState()` and the hook
 * doesn't re-subscribe on every state change. The owning store is
 * the source of truth for "when did this last run?".
 *
 * Use cases at time of writing: `useAutoRefresh` (feed
 * publisher fetches every 30min) and `useLicenseRefresh` (license
 * token re-verification once a day). Adding a third caller should
 * land as one more import of this hook, not a third copy of the
 * setInterval + focus listener block.
 */
export interface StaleIntervalOptions {
  /** The work to perform when the timer ticks or focus returns stale. */
  run: () => void | Promise<void>;
  /** Epoch-ms of the last completed run, or null if never run this session. */
  lastAt: () => number | null;
  /** Threshold for both the background timer and the focus-staleness check. */
  intervalMs: number;
}

export function useStaleInterval(options: StaleIntervalOptions): void {
  const { run, lastAt, intervalMs } = options;
  useEffect(() => {
    function runIfOnline() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      void run();
    }

    const timer = setInterval(runIfOnline, intervalMs);

    function runIfStale() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const last = lastAt();
      if (last !== null && Date.now() - last < intervalMs) return;
      runIfOnline();
    }

    window.addEventListener("focus", runIfStale);
    document.addEventListener("visibilitychange", runIfStale);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", runIfStale);
      document.removeEventListener("visibilitychange", runIfStale);
    };
    // Mount once. The run/lastAt callbacks are expected to be stable
    // (or to read from a getState() chain that doesn't change identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
