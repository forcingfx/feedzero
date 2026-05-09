import { describe, it, expect } from "vitest";
import { extractImage } from "../../src/lib/extract-image.ts";
import type { Article } from "../../src/types";

function makeArticle(overrides: Partial<Article>): Article {
  return {
    id: "a",
    feedId: "f",
    guid: "g",
    title: "T",
    link: "https://example.com",
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

describe("extractImage", () => {
  it("returns the first https <img src> from content", () => {
    const article = makeArticle({
      content: '<p>Hello</p><img src="https://example.com/a.jpg"><img src="https://example.com/b.jpg">',
    });
    expect(extractImage(article)).toBe("https://example.com/a.jpg");
  });

  it("falls back to summary when content has no image", () => {
    const article = makeArticle({
      content: "<p>No image here</p>",
      summary: '<img src="https://cdn.example.com/x.png">',
    });
    expect(extractImage(article)).toBe("https://cdn.example.com/x.png");
  });

  it("returns null when neither field has an image", () => {
    expect(extractImage(makeArticle({ content: "<p>Just text</p>", summary: "" }))).toBeNull();
  });

  it("skips http:// URLs (CSP allows only https)", () => {
    const article = makeArticle({
      content: '<img src="http://insecure.example.com/x.png"><img src="https://secure.example.com/y.png">',
    });
    expect(extractImage(article)).toBe("https://secure.example.com/y.png");
  });

  it("skips data: URLs (likely tracking pixels)", () => {
    const article = makeArticle({
      content: '<img src="data:image/gif;base64,R0lGODlh..."><img src="https://example.com/real.jpg">',
    });
    expect(extractImage(article)).toBe("https://example.com/real.jpg");
  });

  it("handles single-quoted attributes", () => {
    const article = makeArticle({ content: "<img src='https://example.com/a.jpg'>" });
    expect(extractImage(article)).toBe("https://example.com/a.jpg");
  });

  it("decodes HTML entities in src", () => {
    const article = makeArticle({
      content: '<img src="https://example.com/a.jpg?x=1&amp;y=2">',
    });
    expect(extractImage(article)).toBe("https://example.com/a.jpg?x=1&y=2");
  });

  it("returns null for malformed HTML (no quotes)", () => {
    expect(extractImage(makeArticle({ content: "<img src=" }))).toBeNull();
  });

  it("rejects images with explicit width or height under 300", () => {
    const article = makeArticle({
      content: '<img src="https://example.com/thumb.jpg" width="120" height="80"><img src="https://example.com/full.jpg" width="800" height="500">',
    });
    expect(extractImage(article)).toBe("https://example.com/full.jpg");
  });

  it("rejects URLs matching common thumbnail patterns", () => {
    for (const pattern of [
      "/thumb/photo.jpg",
      "/thumbs/photo.jpg",
      "/small/photo.jpg",
      "_small.jpg",
      "_thumb.jpg",
      "-thumb.jpg",
      "_50x50.jpg",
      "/icon/photo.png",
    ]) {
      const article = makeArticle({
        content: `<img src="https://example.com${pattern}"><img src="https://example.com/full-hero.jpg">`,
      });
      expect(extractImage(article)).toBe("https://example.com/full-hero.jpg");
    }
  });

  it("accepts an image without explicit dimensions if URL doesn't look thumbnail-y", () => {
    const article = makeArticle({
      content: '<img src="https://example.com/wp-content/uploads/hero-shot.jpg">',
    });
    expect(extractImage(article)).toBe("https://example.com/wp-content/uploads/hero-shot.jpg");
  });

  it("returns null when only a small thumbnail is available", () => {
    const article = makeArticle({
      content: '<img src="https://example.com/_small/avatar.png" width="80" height="80">',
    });
    expect(extractImage(article)).toBeNull();
  });
});
