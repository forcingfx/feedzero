import { describe, it, expect } from "vitest";
import { sanitize } from "../../../src/core/parser/sanitizer.js";

describe("Sanitizer", () => {
  it("should preserve safe HTML", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitize(html)).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("should strip script tags", () => {
    const html = "<p>Hello</p><script>var x = 1;</script><p>World</p>";
    const result = sanitize(html);
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("should strip event handlers", () => {
    const html = '<p onclick="void(0)" onmouseover="void(0)">Text</p>';
    const result = sanitize(html);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("Text");
  });

  it("should strip javascript: URLs from href", () => {
    const html = '<a href="javascript:void(0)">Click</a>';
    const result = sanitize(html);
    expect(result).not.toContain("javascript:");
  });

  it("should allow safe links", () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitize(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("should allow images with safe src", () => {
    const html = '<img src="https://example.com/img.png" alt="photo">';
    const result = sanitize(html);
    expect(result).toContain('src="https://example.com/img.png"');
    expect(result).toContain('alt="photo"');
  });

  it("should strip disallowed attributes", () => {
    const html = '<p style="color:red" data-x="1" class="ok">Text</p>';
    const result = sanitize(html);
    expect(result).not.toContain("style");
    expect(result).not.toContain("data-x");
    expect(result).toContain('class="ok"');
  });

  it("should strip iframe tags", () => {
    const html = '<div>Safe text<iframe src="https://evil.com"></iframe></div>';
    const result = sanitize(html);
    expect(result).not.toContain("iframe");
    expect(result).toContain("Safe text");
  });

  it("should return empty string for null/undefined input", () => {
    expect(sanitize(null)).toBe("");
    expect(sanitize(undefined)).toBe("");
    expect(sanitize("")).toBe("");
  });

  it("should strip HTML comments", () => {
    const html = "<p>Hello<!-- comment -->World</p>";
    const result = sanitize(html);
    expect(result).not.toContain("comment");
  });

  it("should strip SVG with event handlers", () => {
    const html = '<svg onload="void(0)"><circle r="10"/></svg>';
    const result = sanitize(html);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("svg");
  });
});
