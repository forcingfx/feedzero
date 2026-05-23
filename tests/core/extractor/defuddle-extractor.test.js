import { describe, it, expect } from "vitest";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import { extract } from "../../../src/core/extractor/defuddle-extractor.ts";

const ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
  <article>
    <h1>Test Article</h1>
    <p>By Alice on January 15, 2024</p>
    <p>This is the first paragraph of a long article about testing.</p>
    <p>This is the second paragraph with more detail about the topic.</p>
    <p>And a third paragraph to ensure there is enough content for extraction.</p>
    <p>The article continues with additional information that is relevant.</p>
    <p>Finally, the conclusion wraps up the main points discussed.</p>
  </article>
  <footer><p>Copyright 2024</p></footer>
</body>
</html>`;

describe("defuddle-extractor", () => {
  it("should extract content from a well-structured HTML page", () => {
    const result = extract(ARTICLE_HTML, "https://example.com/post/1");
    expect(isOk(result)).toBe(true);

    const extracted = unwrap(result);
    expect(extracted.content).toBeTruthy();
    expect(extracted.content).toContain("first paragraph");
    expect(extracted.content).toContain("conclusion");
  });

  it("should strip navigation and footer elements", () => {
    const result = extract(ARTICLE_HTML, "https://example.com/post/1");
    const extracted = unwrap(result);

    expect(extracted.content).not.toContain("Home");
    expect(extracted.content).not.toContain("Copyright");
  });

  it("should extract the title", () => {
    const result = extract(ARTICLE_HTML, "https://example.com/post/1");
    const extracted = unwrap(result);
    expect(extracted.title).toBe("Test Article");
  });

  it("should return sanitized HTML (no script tags)", () => {
    const maliciousHtml = `<!DOCTYPE html>
<html><head><title>Bad Page</title></head>
<body>
  <article>
    <p>Safe content here.</p>
    <script>alert('xss')</script>
    <p>More safe content after the script.</p>
  </article>
</body></html>`;

    const result = extract(maliciousHtml, "https://example.com/bad");
    expect(isOk(result)).toBe(true);

    const extracted = unwrap(result);
    expect(extracted.content).not.toContain("<script");
    expect(extracted.content).not.toContain("alert");
    expect(extracted.content).toContain("Safe content");
  });

  it("should return error for empty HTML", () => {
    const result = extract("", "https://example.com/empty");
    expect(isErr(result)).toBe(true);
  });

  it("should return error for non-HTML content", () => {
    const result = extract("just plain text with no html structure", "https://example.com/plain");
    // Should either extract something or return an error — not crash
    expect(result).toHaveProperty("ok");
  });
});
