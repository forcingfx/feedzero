import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../../../src/core/extractor/markdown.ts";

describe("markdownToHtml", () => {
  it("converts basic markdown to HTML", () => {
    const result = markdownToHtml("# Hello\n\nA paragraph.");
    expect(result).toContain("<h1>");
    expect(result).toContain("Hello");
    expect(result).toContain("<p>");
    expect(result).toContain("A paragraph.");
  });

  it("converts links", () => {
    const result = markdownToHtml("[click](https://example.com)");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("click");
  });

  it("converts code blocks", () => {
    const result = markdownToHtml("```js\nconsole.log(1);\n```");
    expect(result).toContain("<pre>");
    expect(result).toContain("console.log(1);");
  });

  it("sanitizes dangerous HTML in markdown", () => {
    const result = markdownToHtml("Hello <script>var x = 1;</script> world");
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello");
    expect(result).toContain("world");
  });

  it("returns empty string for empty input", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml(null as unknown as string)).toBe("");
  });

  it("converts images", () => {
    const result = markdownToHtml("![alt text](https://example.com/img.png)");
    expect(result).toContain("<img");
    expect(result).toContain('src="https://example.com/img.png"');
    expect(result).toContain('alt="alt text"');
  });
});
