/**
 * Sidebar-header status badge.
 *
 * Surfaces two independent facts on one line:
 *
 *   <refresh state> · <sync mode>
 *
 * - **Refresh state** describes the publisher fetch — "Refreshing…"
 *   while `feed-store.isRefreshingAll` is true, otherwise
 *   "Refreshed Xm ago" derived from `lastRefreshAllAt`. Absent when
 *   the user has never refreshed (fresh local install).
 *
 * - **Sync mode** is the underlying sync-store status — `local`,
 *   `synced`, `syncing` (vault push in flight), or `error`.
 *
 * Splitting them came out of "Local only" being misleading: under the
 * old badge, a routine publisher refresh on a local-only user flipped
 * the pill to "Syncing…" via `useIsAppBusy`, which read as "your data
 * is syncing to the cloud" — exactly the opposite of what was true.
 *
 * Visual rules:
 *   - Idle states use muted-foreground text and a small dot — quiet.
 *   - Active states (refresh in flight, vault push in flight) lean
 *     on the sky/spinner colour to signal motion.
 *   - The error state stays loud rose: the user needs to see it.
 *
 * License `verifying` is intentionally NOT folded in here — license
 * recheck is background plumbing, not a cloud event. Settings →
 * Account is the right surface for it.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";

function formatRelative(ts: number, now: number): string {
  const delta = Math.max(0, now - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  return `${day} d ago`;
}

const TICK_INTERVAL_MS = 30 * 1000;

type DisplayState = "local-only" | "syncing" | "synced" | "error";

export function SyncStatusBadge() {
  const status = useSyncStore((s) => s.status);
  const lastRefreshAllAt = useFeedStore((s) => s.lastRefreshAllAt);
  const isRefreshingAll = useFeedStore((s) => s.isRefreshingAll);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a "Refreshed Xm ago" label is on screen so it doesn't
  // get stuck at "just now" on a tab that's been idle for an hour.
  const hasRefreshHistory = lastRefreshAllAt !== null;
  useEffect(() => {
    if (!hasRefreshHistory) return;
    if (isRefreshingAll) return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasRefreshHistory, isRefreshingAll]);

  const displayState: DisplayState = status;
  const modeWord =
    status === "synced" || status === "syncing" ? "synced" : "local";

  // Compose the left half. Refresh state takes precedence when the
  // publisher fetch is in flight; otherwise we surface a relative
  // timestamp when one exists, and nothing when the user has never
  // refreshed.
  let leftLabel: string | null = null;
  if (isRefreshingAll) leftLabel = "Refreshing…";
  else if (status === "syncing") leftLabel = "Syncing…";
  else if (lastRefreshAllAt !== null)
    leftLabel = `Refreshed ${formatRelative(lastRefreshAllAt, now)}`;

  const isError = status === "error";
  const isActive = isRefreshingAll || status === "syncing";

  const label = (() => {
    if (isError) return "Sync error";
    if (leftLabel === null) {
      // Fresh install — only the mode word is meaningful.
      return status === "synced" ? "Synced" : "Local";
    }
    return `${leftLabel} · ${modeWord}`;
  })();

  // Color theming: only the active and error states have a strong
  // pill background; idle is text-muted-foreground on transparent.
  const tone = (() => {
    if (isError)
      return "text-rose-700 dark:text-rose-300 ring-rose-500/30 bg-rose-500/10 ring-1 ring-inset";
    if (isActive)
      return "text-sky-700 dark:text-sky-300 ring-sky-500/30 bg-sky-500/10 ring-1 ring-inset";
    return "text-muted-foreground";
  })();

  const dotColor = (() => {
    if (isError) return "bg-rose-500";
    if (isActive) return "bg-sky-500";
    if (status === "synced") return "bg-emerald-500/70";
    return "bg-muted-foreground/50";
  })();

  return (
    <Link
      to="/settings?tab=sync-and-data"
      data-testid="sync-status-badge"
      data-state={displayState}
      aria-label={`Cloud sync: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        "hover:text-foreground transition-colors",
        tone,
      )}
    >
      {isActive ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", dotColor)}
        />
      )}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
