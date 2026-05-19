import { AlertCircle } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { findOrphanedFeeds } from "@/lib/orphaned-feeds.ts";

/**
 * Visible-but-quiet diagnostic for feeds whose `folderId` points at a
 * folder that doesn't exist on this device. Returns null on the common
 * path (no orphans) so the notice never adds noise; renders a single
 * one-line card when state is half-applied.
 *
 * Background: a v1 cloud vault (pre-ADR-019) carried feeds + articles
 * only. Restoring it on a v2 client meant feeds arrived with their
 * `folderId` set but no matching folder rows. The sidebar's defensive
 * render now falls those feeds back to Unfiled so they're never
 * invisible (see `sidebar-feed-list.tsx`), and this notice tells the
 * user what's happening + how to resolve it.
 *
 * Quietest acceptable surface: title + count + one-sentence next step.
 * No toast. No modal. No interrupt.
 */
export function OrphanedFeedsNotice() {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const orphans = findOrphanedFeeds(feeds, folders);

  if (orphans.length === 0) return null;

  const count = orphans.length;
  const noun = count === 1 ? "feed references" : "feeds reference";

  return (
    <div
      role="status"
      data-testid="orphaned-feeds-notice"
      className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 flex items-start gap-3"
    >
      <AlertCircle className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="text-sm space-y-1">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          {count} {noun} a folder that isn't on this device
        </div>
        <div className="text-amber-800/80 dark:text-amber-200/80">
          They appear under Unfiled. Refresh to re-sync, or move them
          into a folder from the sidebar context menu. This usually
          self-heals on the next sync push from your other device.
        </div>
      </div>
    </div>
  );
}
