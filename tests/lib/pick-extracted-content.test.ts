import { describe, it, expect } from "vitest";
import { pickExtractedContent } from "../../src/lib/pick-extracted-content.ts";
import type { Article } from "@feedzero/core/types";

function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    feedId: "f1",
    guid: "g1",
    title: "T",
    link: "https://example.com/a/1",
    content: "<p>teaser</p>",
    summary: "",
    author: "",
    publishedAt: 1,
    read: false,
    createdAt: 1,
    ...overrides,
  };
}

describe("pickExtractedContent", () => {
  it("returns the persisted extractedContent when present, regardless of cache", () => {
    const article = buildArticle({ extractedContent: "<article>persisted</article>" });
    const cache = { "https://example.com/a/1": "<article>cached</article>" };
    expect(pickExtractedContent(article, cache)).toBe("<article>persisted</article>");
  });

  it("falls back to the in-memory cache when no persisted content exists", () => {
    const article = buildArticle();
    const cache = { "https://example.com/a/1": "<article>cached</article>" };
    expect(pickExtractedContent(article, cache)).toBe("<article>cached</article>");
  });

  it("returns undefined when neither persisted nor cached content exists", () => {
    expect(pickExtractedContent(buildArticle(), {})).toBeUndefined();
  });

  it("returns undefined when the article has no link (cache key would be missing)", () => {
    const article = buildArticle({ link: "" });
    expect(pickExtractedContent(article, {})).toBeUndefined();
  });

  it("treats an empty persisted string as missing and falls back to the cache", () => {
    // A zero-length extractedContent would mean "we tried and got nothing".
    // The on-demand cache may have a real result from a retry, so prefer it.
    const article = buildArticle({ extractedContent: "" });
    const cache = { "https://example.com/a/1": "<article>cached</article>" };
    expect(pickExtractedContent(article, cache)).toBe("<article>cached</article>");
  });
});
