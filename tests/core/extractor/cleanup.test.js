import { describe, it, expect } from "vitest";
import { cleanExtractedContent } from "../../../src/core/extractor/cleanup.ts";

describe("cleanExtractedContent", () => {
  it("should remove empty paragraphs", () => {
    const html = "<p>Hello</p><p></p><p>World</p>";
    const result = cleanExtractedContent(html);
    expect(result).toBe("<p>Hello</p><p>World</p>");
  });

  it("should remove empty divs and spans", () => {
    const html = "<div></div><span></span><p>Content</p>";
    const result = cleanExtractedContent(html);
    expect(result).toBe("<p>Content</p>");
  });

  it("should remove whitespace-only elements", () => {
    const html = "<p>   </p><p>Real content</p>";
    const result = cleanExtractedContent(html);
    expect(result).toBe("<p>Real content</p>");
  });

  it("should keep elements with images", () => {
    const html = '<p><img src="test.jpg"></p><p></p>';
    const result = cleanExtractedContent(html);
    expect(result).toContain("<img");
  });

  it("should collapse consecutive br tags", () => {
    const html = "<p>Line 1<br><br><br>Line 2</p>";
    const result = cleanExtractedContent(html);
    expect(result).toBe("<p>Line 1<br>Line 2</p>");
  });

  it("should handle br tags with whitespace between them", () => {
    const html = "<p>Line 1<br>\n<br>\n<br>Line 2</p>";
    const result = cleanExtractedContent(html);
    expect(result).not.toContain("<br><br>");
  });

  it("should return empty/null input unchanged", () => {
    expect(cleanExtractedContent("")).toBe("");
    expect(cleanExtractedContent(null)).toBe(null);
  });

  it("should preserve meaningful content structure", () => {
    const html =
      "<h2>Title</h2><p>Paragraph one.</p><p>Paragraph two.</p><blockquote>A quote</blockquote>";
    const result = cleanExtractedContent(html);
    expect(result).toBe(html);
  });

  it("should remove empty anchor tags", () => {
    const html = '<a href=""></a><p>Content</p>';
    const result = cleanExtractedContent(html);
    expect(result).toBe("<p>Content</p>");
  });

  it("should add loading=lazy and decoding=async to images that lack them", () => {
    const html = '<p>Above the fold</p><img src="a.jpg"><img src="b.jpg">';
    const result = cleanExtractedContent(html);
    // happy-dom serializes attributes in source order — both new
    // attributes appear; exact order is not asserted to keep the test
    // robust against happy-dom version drift.
    expect(result).toMatch(/<img[^>]*\bloading="lazy"/);
    expect(result).toMatch(/<img[^>]*\bdecoding="async"/);
    // Count: both images get both attributes.
    expect(result.match(/loading="lazy"/g)).toHaveLength(2);
    expect(result.match(/decoding="async"/g)).toHaveLength(2);
  });

  it("should keep an existing loading attribute if the publisher set one", () => {
    const html = '<img src="hero.jpg" loading="eager"><img src="b.jpg">';
    const result = cleanExtractedContent(html);
    expect(result).toMatch(/<img[^>]*src="hero\.jpg"[^>]*loading="eager"/);
    // The second image (no publisher loading attr) gets lazy.
    expect(result.match(/loading="lazy"/g)).toHaveLength(1);
  });
});
