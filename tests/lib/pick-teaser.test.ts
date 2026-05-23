import { describe, it, expect } from "vitest";
import { pickTeaser } from "../../src/lib/pick-teaser.ts";
import type { Article } from "../../src/types/index.ts";

function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    feedId: "f1",
    guid: "g1",
    title: "T",
    link: "https://example.com/a/1",
    content: "",
    summary: "",
    author: "",
    publishedAt: 1,
    read: false,
    createdAt: 1,
    ...overrides,
  };
}

describe("pickTeaser", () => {
  it("uses the feed-provided content blurb when present", () => {
    const article = buildArticle({ content: "<p>A short summary.</p>" });
    expect(pickTeaser(article, 280)).toBe("A short summary.");
  });

  it("falls back to summary when content is empty", () => {
    const article = buildArticle({ summary: "<p>Alt blurb.</p>" });
    expect(pickTeaser(article, 280)).toBe("Alt blurb.");
  });

  it("ignores extractedContent when the feed blurb is present (preserves curated wording)", () => {
    const article = buildArticle({
      content: "<p>Curated blurb.</p>",
      extractedContent: "<p>Full article body, do not show.</p>",
    });
    expect(pickTeaser(article, 200)).toBe("Curated blurb.");
  });

  it("falls back to the first sentence of extractedContent when the feed blurb is missing", () => {
    const article = buildArticle({
      extractedContent:
        "<p>This is the lede sentence. Then more body text follows.</p>",
    });
    const result = pickTeaser(article, 40);
    expect(result).toBe("This is the lede sentence.");
  });

  it("packs additional sentences when they fit under the limit", () => {
    const article = buildArticle({
      extractedContent: "<p>One. Two. Three. Four. Five. Six. Seven.</p>",
    });
    const result = pickTeaser(article, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.startsWith("One.")).toBe(true);
    expect(result).toContain("Two.");
  });

  it("hard-truncates with an ellipsis when the first sentence exceeds the limit", () => {
    const longSentence =
      "This single sentence is significantly longer than the requested character limit";
    const article = buildArticle({
      extractedContent: `<p>${longSentence}</p>`,
    });
    const result = pickTeaser(article, 30);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(31);
  });

  it("returns an empty string when no source has content", () => {
    expect(pickTeaser(buildArticle(), 200)).toBe("");
  });

  it("decodes HTML entities in the chosen source", () => {
    const article = buildArticle({ content: "<p>It&rsquo;s here.</p>" });
    expect(pickTeaser(article, 200)).toBe("It’s here.");
  });

  it("strips HTML from the extracted-content fallback", () => {
    const article = buildArticle({
      extractedContent:
        "<article><h1>Heading</h1><p>The <em>real</em> first sentence.</p></article>",
    });
    expect(pickTeaser(article, 200)).toMatch(/Heading\s+The real first sentence\./);
  });
});
