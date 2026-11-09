import type { Feed, Folder, OpenArticlesIn } from "../../../packages/core/src/types";

/**
 * Whether an article from `feed` opens in extracted full text.
 *
 * The most specific setting wins: the feed's own "Prefer full text"
 * toggle, then the nearest folder (walking up through parents) that sets
 * `openArticlesIn`, then the app-wide preference. A feed toggle can only
 * opt in, because it is a boolean that predates the folder setting.
 */
export function shouldOpenInFullText(
  feed: Feed | undefined,
  folders: readonly Folder[],
  appDefault: OpenArticlesIn | undefined,
): boolean {
  if (feed?.preferFullText) return true;
  const folderChoice = nearestFolderChoice(feed?.folderId, folders);
  return (folderChoice ?? appDefault) === "full-text";
}

function nearestFolderChoice(
  folderId: string | undefined,
  folders: readonly Folder[],
): OpenArticlesIn | undefined {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const visited = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !visited.has(current.id)) {
    if (current.openArticlesIn) return current.openArticlesIn;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}
