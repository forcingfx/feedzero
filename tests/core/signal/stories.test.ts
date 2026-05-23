import { describe, it, expect } from "vitest";
import { groupIntoStories } from "@/core/signal/stories.ts";
import type { Article } from "@feedzero/core/types";

const NOW = new Date("2026-05-21T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeArticle(id: string, feedId: string, title: string, ageDays = 0): Article {
  const publishedAt = NOW - ageDays * DAY;
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt,
    read: false,
    createdAt: publishedAt,
  };
}

function soloMembers(reps: Article[]): Map<string, Article[]> {
  return new Map(reps.map((r) => [r.id, [r]]));
}

describe("groupIntoStories", () => {
  it("merges representatives with similar headlines into one story", () => {
    const reps = [
      makeArticle("a", "f1", "Mayor resigns amid corruption scandal"),
      makeArticle("b", "f2", "Mayor resigns over corruption scandal"),
    ];
    const stories = groupIntoStories(reps, soloMembers(reps));
    expect(stories).toHaveLength(1);
    expect(stories[0].feedCount).toBe(2);
    expect(stories[0].articleIds).toHaveLength(2);
  });

  it("keeps unrelated headlines as separate stories", () => {
    const reps = [
      makeArticle("a", "f1", "Apple ships new headset"),
      makeArticle("b", "f2", "Tariffs rattle global markets"),
    ];
    const stories = groupIntoStories(reps, soloMembers(reps));
    expect(stories).toHaveLength(2);
  });

  it("counts every outlet that ran an exact-duplicate story", () => {
    const rep = makeArticle("a", "f1", "Breaking: summit ends without deal");
    const members = new Map<string, Article[]>([
      [
        "a",
        [
          rep,
          makeArticle("a2", "f2", "Breaking: summit ends without deal"),
          makeArticle("a3", "f3", "Breaking: summit ends without deal"),
        ],
      ],
    ]);
    const stories = groupIntoStories([rep], members);
    expect(stories).toHaveLength(1);
    expect(stories[0].feedCount).toBe(3);
    expect(stories[0].articleIds).toHaveLength(3);
  });

  it("orders stories by outlet count, then recency", () => {
    const reps = [
      makeArticle("solo", "f1", "Council debates zoning rules", 0),
      makeArticle("wide", "f2", "Election results spark recount fight", 1),
    ];
    const members = new Map<string, Article[]>([
      ["solo", [reps[0]]],
      [
        "wide",
        [reps[1], makeArticle("wide2", "f3", "Election results spark recount fight", 1)],
      ],
    ]);
    const stories = groupIntoStories(reps, members);
    // Multi-outlet story leads despite the solo story being newer.
    expect(stories[0].id).toBe("wide");
    expect(stories[0].feedCount).toBe(2);
  });

  it("orders article ids within a story most-recent first", () => {
    const rep = makeArticle("new", "f1", "Quake hits coastal city", 0);
    const members = new Map<string, Article[]>([
      ["new", [rep, makeArticle("old", "f2", "Quake hits coastal city", 3)]],
    ]);
    const stories = groupIntoStories([rep], members);
    expect(stories[0].articleIds).toEqual(["new", "old"]);
  });
});
