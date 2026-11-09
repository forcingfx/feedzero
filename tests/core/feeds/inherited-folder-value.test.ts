import { describe, it, expect } from "vitest";
import { inheritedFolderValue } from "@/core/feeds/folder-tree";
import type { Folder } from "@feedzero/core/types";

function folder(id: string, overrides: Partial<Folder> = {}): Folder {
  return { id, name: id, createdAt: 0, ...overrides };
}

/**
 * Shared by every per-folder setting a subfolder inherits (open articles
 * in, collapse similar stories). The nearest folder that sets the value
 * wins; a folder with no value defers to its parent.
 */
describe("inheritedFolderValue", () => {
  const pick = (f: Folder) => f.collapseSimilar;

  it("returns the folder's own value when set", () => {
    const folders = [folder("a", { collapseSimilar: "strict" })];
    expect(inheritedFolderValue("a", folders, pick)).toBe("strict");
  });

  it("walks up to the nearest ancestor that sets a value", () => {
    const folders = [
      folder("root", { collapseSimilar: "loose" }),
      folder("mid", { parentId: "root" }),
      folder("leaf", { parentId: "mid" }),
    ];
    expect(inheritedFolderValue("leaf", folders, pick)).toBe("loose");
  });

  it("returns undefined for a missing folder, an unset chain, or no folder id", () => {
    const folders = [folder("a", { parentId: "b" }), folder("b")];
    expect(inheritedFolderValue("gone", folders, pick)).toBeUndefined();
    expect(inheritedFolderValue("a", folders, pick)).toBeUndefined();
    expect(inheritedFolderValue(undefined, folders, pick)).toBeUndefined();
  });

  it("stops on a parent cycle", () => {
    const folders = [folder("a", { parentId: "b" }), folder("b", { parentId: "a" })];
    expect(inheritedFolderValue("a", folders, pick)).toBeUndefined();
  });
});
