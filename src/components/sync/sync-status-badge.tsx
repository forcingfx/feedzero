/**
 * The persistent "are we synced?" affordance in the top-right of the
 * app shell.
 *
 * Lives outside the sidebar (which collapses on /settings + mobile
 * Sheet) so the sync state is visible on every route. The badge is a
 * link to Settings → Sync & Data so a single click takes the user
 * from "I'm not sure" to "let me configure it".
 *
 * Visual rules — see {@link SyncStatus}:
 *   local-only → amber dot, "Local only"
 *   syncing    → spinner,   "Syncing…"
 *   synced     → emerald dot, "Synced · <relative>"
 *   error      → rose dot,  "Sync error"
 *
 * The relative-time string ticks itself on a 30s interval so a synced
 * badge doesn't get stuck at "just now" for hours on a quiet tab.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/stores/sync-store";

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

export function SyncStatusBadge() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "synced") return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status]);

  const colorRing = {
    "local-only":
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    syncing:
      "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30",
    synced:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30",
    error: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
  }[status];

  const dotColor = {
    "local-only": "bg-amber-500",
    syncing: "bg-sky-500",
    synced: "bg-emerald-500",
    error: "bg-rose-500",
  }[status];

  const label = (() => {
    switch (status) {
      case "local-only":
        return "Local only";
      case "syncing":
        return "Syncing…";
      case "synced":
        return lastSyncedAt
          ? `Synced · ${formatRelative(lastSyncedAt, now)}`
          : "Synced";
      case "error":
        return "Sync error";
    }
  })();

  return (
    <Link
      to="/settings?tab=sync-and-data"
      data-testid="sync-status-badge"
      data-state={status}
      aria-label={`Cloud sync: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset shadow-sm",
        "backdrop-blur-sm transition-colors",
        "hover:brightness-95 dark:hover:brightness-110",
        colorRing,
      )}
    >
      {status === "syncing" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            dotColor,
            status === "synced" && "shadow-[0_0_6px_currentColor]",
          )}
        />
      )}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
