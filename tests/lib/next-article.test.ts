import { describe, it, expect } from "vitest";
import { findNextArticle, findPrevArticle } from "@/lib/next-article";
import type { Article } from "@feedzero/core/types";

function makeArticle(id: string): Article {
  return {
    id,
    feedId: "f1",
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
  };
}

describe("findNextArticle", () => {
  const a = makeArticle("a");
  const b = makeArticle("b");
  const c = makeArticle("c");

  it("returns the article after the current one in the list", () => {
    expect(findNextArticle([a, b, c], a)).toEqual(b);
    expect(findNextArticle([a, b, c], b)).toEqual(c);
  });

  it("returns null when the current article is the last", () => {
    expect(findNextArticle([a, b, c], c)).toBeNull();
  });

  it("returns null when there is no current article", () => {
    expect(findNextArticle([a, b, c], null)).toBeNull();
  });

  it("returns null when the list is empty", () => {
    expect(findNextArticle([], a)).toBeNull();
  });

  it("returns null when the current article is not in the list", () => {
    const orphan = makeArticle("orphan");
    expect(findNextArticle([a, b, c], orphan)).toBeNull();
  });
});

describe("findPrevArticle", () => {
  const a = makeArticle("a");
  const b = makeArticle("b");
  const c = makeArticle("c");

  it("returns the article before the current one in the list", () => {
    expect(findPrevArticle([a, b, c], b)).toEqual(a);
    expect(findPrevArticle([a, b, c], c)).toEqual(b);
  });

  it("returns null when the current article is the first", () => {
    expect(findPrevArticle([a, b, c], a)).toBeNull();
  });

  it("returns null when there is no current article", () => {
    expect(findPrevArticle([a, b, c], null)).toBeNull();
  });

  it("returns null when the list is empty", () => {
    expect(findPrevArticle([], a)).toBeNull();
  });

  it("returns null when the current article is not in the list", () => {
    const orphan = makeArticle("orphan");
    expect(findPrevArticle([a, b, c], orphan)).toBeNull();
  });
});
