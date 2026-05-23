import { describe, it, expect } from "vitest";
import { findOrphanedFeeds } from "../../src/lib/orphaned-feeds.ts";
import type { Feed, Folder } from "@feedzero/core/types";

function feed(id: string, folderId?: string): Feed {
  return {
    id,
    url: `https://${id}.test/feed`,
    title: id,
    description: "",
    siteUrl: `https://${id}.test`,
    createdAt: 0,
    updatedAt: 0,
    folderId,
  };
}

function folder(id: string): Folder {
  return { id, name: id, createdAt: 0 };
}

describe("findOrphanedFeeds", () => {
  it("returns empty when no feed has a folderId", () => {
    expect(findOrphanedFeeds([feed("a"), feed("b")], [])).toEqual([]);
  });

  it("returns empty when every feed's folderId matches a known folder", () => {
    expect(
      findOrphanedFeeds(
        [feed("a", "tech"), feed("b", "news")],
        [folder("tech"), folder("news")],
      ),
    ).toEqual([]);
  });

  it("returns the feeds whose folderId points at a missing folder", () => {
    // This is the issue #117 sidebar-empty scenario: device A organised
    // feeds into "tech" + "news", pushed a v1 vault (feeds only, no
    // folders), device B pulled and got feeds with folderId set but
    // zero matching folder rows.
    const result = findOrphanedFeeds(
      [feed("a", "tech"), feed("b", "news"), feed("c")],
      [folder("tech")],
    );
    expect(result.map((f) => f.id)).toEqual(["b"]);
  });

  it("ignores `folderId: undefined` (truly unfiled feeds are not orphans)", () => {
    expect(findOrphanedFeeds([feed("a")], [folder("tech")])).toEqual([]);
  });

  it("works on a large flat feed list without allocating a Set", () => {
    // The hot-path shortcut: no folderId on any feed AND no folders →
    // skip the Set + filter entirely. Exercised here just for coverage
    // — behaviour matches the slow path.
    const flat = Array.from({ length: 100 }, (_, i) => feed(`f${i}`));
    expect(findOrphanedFeeds(flat, [])).toEqual([]);
  });
});
