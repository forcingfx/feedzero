import type { Feed, Folder } from "@feedzero/core/types";

/**
 * Feeds whose `folderId` points at a folder that doesn't exist on this
 * device. Most commonly: a v1 cloud vault (pre-ADR-019) restored on a
 * v2 client where folders haven't propagated yet. The vault carried
 * the feeds *with* their folder references, but no matching folder
 * rows — so the sidebar's "group by folder" render quietly dropped them.
 *
 * Pure function so it's testable in isolation and cheap to call inside
 * a `useMemo` from any component that needs to surface the state.
 *
 * Returns the feeds themselves (not just ids) so callers can render
 * messages like "3 feeds — Daring Fireball, Quanta Magazine, …" if they
 * want detail. Most callers will only need `.length`.
 */
export function findOrphanedFeeds(feeds: Feed[], folders: Folder[]): Feed[] {
  if (folders.length === 0 && feeds.every((f) => !f.folderId)) {
    // Hot-path shortcut for the common case (flat feed list) — no
    // allocation, no iteration past the early-out.
    return [];
  }
  const folderIds = new Set(folders.map((f) => f.id));
  return feeds.filter(
    (f) => f.folderId !== undefined && !folderIds.has(f.folderId),
  );
}
