/**
 * Pure helpers over the nested-folder shape introduced by the OPML
 * field audit (Part 2). All functions operate on plain `Folder[]`
 * slices — no I/O, no React, no stores — so the sidebar render path
 * and the import-flow's folder pre-create pass share a single
 * implementation of "what's a descendant of what".
 *
 * `parentId === undefined` means top-level. Cycles in stored data are
 * treated defensively: every traversal caps depth at `MAX_DEPTH` so a
 * malformed vault from an older client can't lock up the article list.
 */

import type { Folder } from "../../../packages/core/src/types";

/**
 * Safety cap on folder-tree recursion. Real OPML rarely exceeds 3–4
 * levels; this cap mostly exists to defang a corrupted parentId that
 * forms a self-referential cycle which `isDescendantOf` would not
 * otherwise detect on its first traversal (the cycle-detection set
 * makes O(n²) misuse expensive — depth-cap is cheap).
 */
const MAX_DEPTH = 64;

/**
 * Returns true if `candidate` is `folder` itself or a descendant of
 * `folder` in the parentId chain. Used by `moveFolderToParent` to
 * reject an assignment that would make `folder` its own ancestor.
 */
export function isDescendantOf(
  candidateId: string,
  folderId: string,
  folders: Folder[],
): boolean {
  if (candidateId === folderId) return true;
  const byId = new Map<string, Folder>();
  for (const f of folders) byId.set(f.id, f);

  let current = byId.get(candidateId);
  let depth = 0;
  const visited = new Set<string>();
  while (current && depth < MAX_DEPTH) {
    if (visited.has(current.id)) return false; // malformed cycle, give up
    visited.add(current.id);
    if (current.parentId === folderId) return true;
    if (!current.parentId) return false;
    current = byId.get(current.parentId);
    depth += 1;
  }
  return false;
}

/**
 * Group folders by their parent. The map key is the parentId (or
 * `null` for top-level). Each list preserves the input order.
 */
export function childrenOf(folders: Folder[]): Map<string | null, Folder[]> {
  const map = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentId ?? null;
    const list = map.get(key);
    if (list) list.push(f);
    else map.set(key, [f]);
  }
  return map;
}

/**
 * Return the depth of `folder` in the tree (0 = top-level). Walks the
 * parent chain. Defensively capped at MAX_DEPTH.
 */
export function depthOf(folder: Folder, folders: Folder[]): number {
  const byId = new Map<string, Folder>();
  for (const f of folders) byId.set(f.id, f);
  let depth = 0;
  let current: Folder | undefined = folder;
  const visited = new Set<string>();
  while (current?.parentId && depth < MAX_DEPTH) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    current = byId.get(current.parentId);
    depth += 1;
  }
  return depth;
}
