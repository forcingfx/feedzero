import { describe, it, expect } from "vitest";
import {
  groupArticles,
  type ArticleGroup,
  type ArticleEntry,
} from "@/lib/group-articles";
import type { Article } from "@feedzero/core/types";

const MIN = 60_000;

/** Build a minimal Article test fixture; only fields that grouping reads matter. */
function makeArticle(overrides: Partial<Article> & { id: string }): Article {
  return {
    id: overrides.id,
    feedId: overrides.feedId ?? "feed-a",
    guid: overrides.guid ?? overrides.id,
    title: overrides.title ?? `Title ${overrides.id}`,
    link: overrides.link ?? `https://example.com/${overrides.id}`,
    content: overrides.content ?? "",
    summary: overrides.summary ?? "",
    author: overrides.author ?? "",
    publishedAt: overrides.publishedAt ?? Date.now(),
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe("groupArticles", () => {
  it("returns [] for empty input", () => {
    expect(groupArticles([])).toEqual([]);
  });

  it("returns one singleton for a single article", () => {
    const a = makeArticle({ id: "1" });
    const result = groupArticles([a]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "article", article: a });
  });

  it("does NOT group 4 same-feed articles within the window (below MIN_GROUP_SIZE=5)", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 1 * MIN }),
      makeArticle({ id: "3", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "4", publishedAt: now - 3 * MIN }),
    ];
    const result = groupArticles(articles);
    expect(result).toHaveLength(4);
    expect(result.every((e) => e.kind === "article")).toBe(true);
  });

  it("groups 5 same-feed articles within the window into one ArticleGroup", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 1 * MIN }),
      makeArticle({ id: "3", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "4", publishedAt: now - 3 * MIN }),
      makeArticle({ id: "5", publishedAt: now - 4 * MIN }),
    ];
    const result = groupArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("group");
    const group = result[0] as ArticleGroup;
    expect(group.articles).toHaveLength(5);
    expect(group.feedId).toBe("feed-a");
  });

  it("keeps a long burst as ONE group when all pairwise gaps stay within window (>10min head→tail)", () => {
    // 6 articles, each 8 minutes apart. Pairwise within window; head→tail is 40 minutes.
    const now = 10_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 8 * MIN }),
      makeArticle({ id: "3", publishedAt: now - 16 * MIN }),
      makeArticle({ id: "4", publishedAt: now - 24 * MIN }),
      makeArticle({ id: "5", publishedAt: now - 32 * MIN }),
      makeArticle({ id: "6", publishedAt: now - 40 * MIN }),
    ];
    const result = groupArticles(articles);
    expect(result).toHaveLength(1);
    expect((result[0] as ArticleGroup).articles).toHaveLength(6);
  });

  it("breaks a run at an adjacent gap larger than WINDOW_MS", () => {
    // 6 same-feed articles. The 11-minute gap between #3 and #4 breaks
    // the run into two sub-runs, neither of which reaches MIN_GROUP_SIZE=5.
    const now = 10_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 1 * MIN }),
      makeArticle({ id: "3", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "4", publishedAt: now - 13 * MIN }), // 11min gap
      makeArticle({ id: "5", publishedAt: now - 14 * MIN }),
      makeArticle({ id: "6", publishedAt: now - 15 * MIN }),
    ];
    const result = groupArticles(articles);
    expect(result).toHaveLength(6);
    expect(result.every((e) => e.kind === "article")).toBe(true);
  });

  it("a cross-feed neighbour interrupts a same-feed run", () => {
    const now = 10_000_000;
    const articles = [
      makeArticle({ id: "1", feedId: "feed-a", publishedAt: now }),
      makeArticle({ id: "2", feedId: "feed-b", publishedAt: now - MIN }),
      makeArticle({ id: "3", feedId: "feed-a", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "4", feedId: "feed-a", publishedAt: now - 3 * MIN }),
      makeArticle({ id: "5", feedId: "feed-a", publishedAt: now - 4 * MIN }),
      makeArticle({ id: "6", feedId: "feed-a", publishedAt: now - 5 * MIN }),
      makeArticle({ id: "7", feedId: "feed-a", publishedAt: now - 6 * MIN }),
    ];
    const result = groupArticles(articles);
    // 1 (feed-a singleton), 2 (feed-b singleton), then 3-7 as a group of 5.
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ kind: "article", article: { id: "1" } });
    expect(result[1]).toMatchObject({ kind: "article", article: { id: "2" } });
    expect(result[2].kind).toBe("group");
    const group = result[2] as ArticleGroup;
    expect(group.articles.map((a) => a.id)).toEqual(["3", "4", "5", "6", "7"]);
  });

  it("MIN_GROUP_SIZE override of 2 groups pairs", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 5 * MIN }),
    ];
    const result = groupArticles(articles, {
      WINDOW_MS: 10 * MIN,
      MIN_GROUP_SIZE: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("group");
  });

  it("WINDOW_MS=0 never groups (every gap exceeds it)", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - 1 }),
      makeArticle({ id: "3", publishedAt: now - 2 }),
    ];
    const result = groupArticles(articles, { WINDOW_MS: 0, MIN_GROUP_SIZE: 3 });
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.kind === "article")).toBe(true);
  });

  it("never groups when either side has publishedAt <= 0 (bad-timestamp gate)", () => {
    // 5+ articles so the count threshold is satisfied; the timestamp gate
    // is what must prevent grouping here.
    const articles = [
      makeArticle({ id: "1", publishedAt: 0 }),
      makeArticle({ id: "2", publishedAt: 0 }),
      makeArticle({ id: "3", publishedAt: 0 }),
      makeArticle({ id: "4", publishedAt: 0 }),
      makeArticle({ id: "5", publishedAt: 0 }),
    ];
    const result = groupArticles(articles);
    expect(result).toHaveLength(5);
    expect(result.every((e) => e.kind === "article")).toBe(true);
  });

  it("produces a stable group id for the same input", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "1", publishedAt: now }),
      makeArticle({ id: "2", publishedAt: now - MIN }),
      makeArticle({ id: "3", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "4", publishedAt: now - 3 * MIN }),
      makeArticle({ id: "5", publishedAt: now - 4 * MIN }),
    ];
    const r1 = groupArticles(articles)[0] as ArticleGroup;
    const r2 = groupArticles(articles)[0] as ArticleGroup;
    expect(r1.id).toBe(r2.id);
    // Sanity: the id encodes feedId, head id, and length
    expect(r1.id).toBe("g:feed-a:1:5");
  });

  it("preserves publishedAt-desc order inside the group", () => {
    const now = 1_000_000;
    const articles = [
      makeArticle({ id: "newest", publishedAt: now }),
      makeArticle({ id: "two", publishedAt: now - MIN }),
      makeArticle({ id: "three", publishedAt: now - 2 * MIN }),
      makeArticle({ id: "four", publishedAt: now - 3 * MIN }),
      makeArticle({ id: "oldest", publishedAt: now - 4 * MIN }),
    ];
    const result = groupArticles(articles);
    const group = result[0] as ArticleGroup;
    expect(group.articles.map((a) => a.id)).toEqual([
      "newest",
      "two",
      "three",
      "four",
      "oldest",
    ]);
  });

  it("ArticleEntry wraps singleton articles with kind: 'article' marker", () => {
    const a = makeArticle({ id: "solo" });
    const [entry] = groupArticles([a]);
    expect(entry.kind).toBe("article");
    expect((entry as ArticleEntry).article).toBe(a);
  });
});
