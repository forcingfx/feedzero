import { describe, it, expect } from "vitest";
import {
  isDescendantOf,
  childrenOf,
  depthOf,
} from "../../../src/core/feeds/folder-tree";
import type { Folder } from "@feedzero/core/types";

function f(id: string, parentId?: string): Folder {
  return { id, name: id, createdAt: 0, parentId };
}

describe("folder-tree", () => {
  describe("isDescendantOf", () => {
    it("returns true when candidate is the folder itself", () => {
      expect(isDescendantOf("a", "a", [f("a")])).toBe(true);
    });

    it("returns true when candidate is a direct child", () => {
      const folders = [f("root"), f("child", "root")];
      expect(isDescendantOf("child", "root", folders)).toBe(true);
    });

    it("returns true for a deep descendant", () => {
      // root -> mid -> leaf
      const folders = [f("root"), f("mid", "root"), f("leaf", "mid")];
      expect(isDescendantOf("leaf", "root", folders)).toBe(true);
    });

    it("returns false for a sibling (not a descendant)", () => {
      const folders = [f("root"), f("a", "root"), f("b", "root")];
      expect(isDescendantOf("a", "b", folders)).toBe(false);
    });

    it("returns false when candidate id is missing from the folder list", () => {
      // The candidate id doesn't exist on this device — treating it as
      // not-a-descendant is the safe fallback (caller will likely
      // surface an error elsewhere).
      expect(isDescendantOf("ghost", "root", [f("root")])).toBe(false);
    });

    it("defends against malformed cycles in stored data", () => {
      // a points at b, b points at a — should not loop forever.
      const folders = [
        { id: "a", name: "a", createdAt: 0, parentId: "b" } as Folder,
        { id: "b", name: "b", createdAt: 0, parentId: "a" } as Folder,
      ];
      // The exact answer for a cycle is "give up safely" — what
      // matters is that it returns within a reasonable time.
      expect(() => isDescendantOf("a", "b", folders)).not.toThrow();
    });
  });

  describe("childrenOf", () => {
    it("groups folders by their parentId, with top-level under null", () => {
      const folders = [
        f("root"),
        f("a", "root"),
        f("b", "root"),
        f("other"),
      ];
      const map = childrenOf(folders);
      expect(map.get(null)?.map((f) => f.id)).toEqual(["root", "other"]);
      expect(map.get("root")?.map((f) => f.id)).toEqual(["a", "b"]);
    });

    it("returns empty map for empty input", () => {
      expect(childrenOf([])).toEqual(new Map());
    });
  });

  describe("depthOf", () => {
    it("returns 0 for a top-level folder", () => {
      const root = f("root");
      expect(depthOf(root, [root])).toBe(0);
    });

    it("returns 2 for a folder two levels deep", () => {
      const root = f("root");
      const mid = f("mid", "root");
      const leaf = f("leaf", "mid");
      expect(depthOf(leaf, [root, mid, leaf])).toBe(2);
    });

    it("breaks out of malformed cycles in stored data", () => {
      const a = { id: "a", name: "a", createdAt: 0, parentId: "b" } as Folder;
      const b = { id: "b", name: "b", createdAt: 0, parentId: "a" } as Folder;
      expect(() => depthOf(a, [a, b])).not.toThrow();
    });
  });
});
