import type { Feed, Folder, OpenArticlesIn } from "../../../packages/core/src/types";
import { inheritedFolderValue } from "../feeds/folder-tree";

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
  const folderChoice = inheritedFolderValue(feed?.folderId, folders, (f) => f.openArticlesIn);
  return (folderChoice ?? appDefault) === "full-text";
}
