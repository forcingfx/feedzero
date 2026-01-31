import { describe, it, expect } from "vitest";
import { needsExtraction } from "../../../src/core/extractor/extractor.js";

describe("needsExtraction", () => {
  it("should return false when article has full content", () => {
    const article = {
      content: "<p>This is a long article with lots of content...</p>".repeat(
        20,
      ),
      summary: "Short summary",
      link: "https://example.com/post/1",
    };
    expect(needsExtraction(article)).toBe(false);
  });

  it("should return true when content is empty and summary is short", () => {
    const article = {
      content: "",
      summary: "A brief teaser about the article.",
      link: "https://example.com/post/2",
    };
    expect(needsExtraction(article)).toBe(true);
  });

  it("should return true when content is missing entirely", () => {
    const article = {
      summary: "Just a summary.",
      link: "https://example.com/post/3",
    };
    expect(needsExtraction(article)).toBe(true);
  });

  it("should return true when content equals summary (both short)", () => {
    const article = {
      content: "A brief description of the post.",
      summary: "A brief description of the post.",
      link: "https://example.com/post/4",
    };
    expect(needsExtraction(article)).toBe(true);
  });

  it("should return false when article has no link", () => {
    const article = {
      content: "",
      summary: "No link available.",
      link: "",
    };
    expect(needsExtraction(article)).toBe(false);
  });

  it("should return false when link is not HTTP", () => {
    const article = {
      content: "",
      summary: "Non-http link.",
      link: "ftp://example.com/file",
    };
    expect(needsExtraction(article)).toBe(false);
  });

  it("should return false when content differs from summary even if short", () => {
    // Short but distinct content means the feed intended this to be the full article
    const article = {
      content: "<p>A short but complete thought.</p>",
      summary: "A short but complete thought.",
      link: "https://example.com/post/5",
    };
    // content (with HTML tags) differs from summary (plain text)
    expect(needsExtraction(article)).toBe(false);
  });
});
