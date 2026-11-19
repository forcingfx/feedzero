import { describe, it, expect } from "vitest";
import { articleListPreview } from "@/lib/article-list-preview.ts";

const article = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "a1",
    feedId: "f1",
    guid: "a1",
    title: "Green Party elects a leader",
    link: "https://example.com/a1",
    content: "",
    summary: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
    ...overrides,
  }) as never;

describe("articleListPreview", () => {
  it("returns the summary as plain text", () => {
    expect(
      articleListPreview(article({ summary: "<p>The <b>sole</b> candidate &amp; winner.</p>" })),
    ).toBe("The sole candidate & winner.");
  });

  it("prefers the summary over the full content", () => {
    expect(
      articleListPreview(article({ summary: "Short blurb.", content: "<p>Whole article body.</p>" })),
    ).toBe("Short blurb.");
  });

  it("falls back to the content, then to the extracted full text", () => {
    expect(articleListPreview(article({ content: "<p>Body text.</p>" }))).toBe("Body text.");
    expect(articleListPreview(article({ extractedContent: "<p>Fetched text.</p>" }))).toBe(
      "Fetched text.",
    );
  });

  it("is empty when the article carries no text", () => {
    expect(articleListPreview(article())).toBe("");
    expect(articleListPreview(article({ content: '<img src="https://example.com/a.png">' }))).toBe("");
  });

  it("clips a long body, so a row never holds a whole article", () => {
    const preview = articleListPreview(article({ content: `<p>${"word ".repeat(2000)}</p>` }));
    expect(preview.length).toBeLessThanOrEqual(281);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("drops a tag the clip cut in half", () => {
    const html = `${"a".repeat(3990)}<a href="https://example.com/very/long/link">x</a>`;
    expect(articleListPreview(article({ content: html }))).not.toContain("<");
  });

  it("is empty when the text only repeats the title", () => {
    expect(
      articleListPreview(article({ summary: "<p>Green Party elects a leader</p>" })),
    ).toBe("");
  });
});
