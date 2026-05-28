import { describe, it, expect } from "vitest";
import { createArticlesForFeed } from "../../../src/core/feeds/feed-service.ts";
import type { ParsedArticle } from "../../../src/core/parser/parser.ts";

const validParsed = (link: string): ParsedArticle => ({
  title: "Title",
  link,
  content: "<p>Body</p>",
  summary: "Summary",
  author: "Author",
  publishedAt: 1_700_000_000_000,
  guid: link,
});

describe("createArticlesForFeed", () => {
  it("stamps every produced Article with the supplied feedId", () => {
    const articles = createArticlesForFeed("feed-7", [
      validParsed("https://x.test/a"),
      validParsed("https://x.test/b"),
    ]);

    expect(articles).toHaveLength(2);
    expect(articles.every((a) => a.feedId === "feed-7")).toBe(true);
  });

  it("returns an empty list when the parsed input is empty", () => {
    expect(createArticlesForFeed("feed-1", [])).toEqual([]);
  });

  it("skips ParsedArticles that schema validation rejects", () => {
    // createArticle requires a non-empty link — an empty link should be
    // dropped rather than crashing the whole ingest, so a single
    // malformed entry can't poison the rest of the feed.
    const articles = createArticlesForFeed("feed-1", [
      validParsed("https://x.test/good"),
      { ...validParsed(""), link: "" },
      validParsed("https://x.test/also-good"),
    ]);

    expect(articles.map((a) => a.link)).toEqual([
      "https://x.test/good",
      "https://x.test/also-good",
    ]);
  });
});
