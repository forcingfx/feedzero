import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";

/** How long the green bar and its chip stay after the work lands. */
const DONE_LINGER_MS = 1200;
/** Length of the ease-out that follows; matches the CSS in index.css. */
const DISMISS_MS = 300;

type Phase = "idle" | "active" | "done" | "leaving" | "error";

const FILL_TONE: Record<Exclude<Phase, "idle">, string> = {
  active: "bg-info sync-bar-slide",
  done: "bg-success w-full",
  leaving: "bg-success w-full sync-bar-out",
  error: "bg-destructive w-full",
};

/** A checkmark that draws itself once, stroke first to last. */
function DrawnCheck() {
  return (
    <svg
      data-testid="mobile-sync-check"
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 text-success"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* pathLength lets the CSS dash the stroke without knowing its real length. */}
      <path className="sync-check-draw" pathLength={1} d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/**
 * The phone's sync status: a 2px bar under the status bar. Blue and
 * moving while feeds refresh or the vault syncs, green for a moment as
 * the work lands, then gone. It replaces the header's status dot, which
 * cost a whole bar to say one thing; the full "Refreshed X ago" line is
 * still in the feed drawer's footer.
 *
 * A chip names the outcome beside a checkmark that draws itself ("Synced", or "Up to date" on a local-only
 * account) only after a refresh, which is work the reader can see land.
 * Background vault pushes get the bar alone: every star and read mark
 * causes one, and a chip per tap would be a notification per tap.
 *
 * An error is the one state that is neither subtle nor brief: the bar
 * holds red and the chip stays until sync recovers.
 */
export function MobileSyncIndicator() {
  const status = useSyncStore((s) => s.status);
  const isRefreshing = useFeedStore((s) => s.isRefreshingAll);
  const busy = isRefreshing || status === "syncing";

  const [landed, setLanded] = useState<{ chip: string | null; leaving: boolean } | null>(null);
  const wasBusy = useRef(false);
  const sawRefresh = useRef(false);

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      if (isRefreshing) sawRefresh.current = true;
      setLanded(null);
      return;
    }
    if (!wasBusy.current) return;
    const refreshed = sawRefresh.current;
    wasBusy.current = false;
    sawRefresh.current = false;
    if (status === "error") return;
    const chip = refreshed ? (status === "local-only" ? "Up to date" : "Synced") : null;
    setLanded({ chip, leaving: false });
    // Both timers are set here, not chained through a re-render, so the
    // ease-out always starts and ends on schedule.
    const easeOut = setTimeout(() => setLanded({ chip, leaving: true }), DONE_LINGER_MS);
    const remove = setTimeout(() => setLanded(null), DONE_LINGER_MS + DISMISS_MS);
    return () => {
      clearTimeout(easeOut);
      clearTimeout(remove);
    };
  }, [busy, isRefreshing, status]);

  const phase: Phase = busy
    ? "active"
    : status === "error"
      ? "error"
      : landed
        ? landed.leaving
          ? "leaving"
          : "done"
        : "idle";
  const chip = phase === "error" ? "Sync error" : landed && !busy ? landed.chip : null;

  return (
    <div
      data-testid="mobile-sync-indicator"
      data-state={phase}
      className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top)] z-30"
    >
      {phase !== "idle" && (
        <div
          role={phase === "active" ? "progressbar" : undefined}
          aria-label={
            phase === "active" ? (isRefreshing ? "Refreshing feeds" : "Syncing") : undefined
          }
          className="h-0.5 overflow-hidden"
        >
          <div
            data-testid="mobile-sync-fill"
            className={cn("h-full transition-colors duration-300", FILL_TONE[phase])}
          />
        </div>
      )}
      {chip && (
        <p
          data-testid="mobile-sync-chip"
          role="status"
          className={cn(
            "liquid-glass mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            phase === "leaving" ? "sync-chip-out" : "sync-chip-in",
            phase === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {phase !== "error" && <DrawnCheck />}
          {chip}
        </p>
      )}
    </div>
  );
}
