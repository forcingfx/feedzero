import { describe, it, expect } from "vitest";
import {
  parsePocketExport,
  isPocketExport,
} from "../../../src/core/opml/pocket-parser.ts";

const SAMPLE_POCKET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Pocket Export</title>
</head>
<body>
<h1>Unread</h1>
<ul>
<li><a href="https://www.nytimes.com/2024/04/01/world/example.html" time_added="1712000000" tags="">NYT Article</a></li>
<li><a href="https://www.theguardian.com/article-1" time_added="1712010000" tags="">Guardian Article</a></li>
<li><a href="https://substack.com/p/whatever" time_added="1712020000" tags="">Subs Article</a></li>
</ul>
<h1>Read Archive</h1>
<ul>
<li><a href="https://www.nytimes.com/2024/04/02/world/another.html" time_added="1712030000" tags="">Another NYT</a></li>
<li><a href="https://writer.substack.com/p/post" time_added="1712040000" tags="">Subdomain Substack</a></li>
</ul>
</body>
</html>`;

describe("isPocketExport", () => {
  it("recognises an export by the time_added attribute marker", () => {
    expect(isPocketExport(SAMPLE_POCKET_HTML)).toBe(true);
  });

  it("recognises an export by the legacy title marker", () => {
    const minimal = "<html><head><title>Pocket Export</title></head><body></body></html>";
    expect(isPocketExport(minimal)).toBe(true);
  });

  it("rejects plain HTML without the Pocket markers", () => {
    const plain = "<html><body><a href='https://example.com'>Link</a></body></html>";
    expect(isPocketExport(plain)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isPocketExport("")).toBe(false);
  });
});

describe("parsePocketExport", () => {
  it("extracts unique origins, collapsing multiple articles from one site", () => {
    const result = parsePocketExport(SAMPLE_POCKET_HTML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      "https://substack.com",
      "https://writer.substack.com",
      "https://www.nytimes.com",
      "https://www.theguardian.com",
    ]);
  });

  it("preserves subdomains (writer.substack.com is distinct from substack.com)", () => {
    const html = `<a href="https://writer.substack.com/p/1" time_added="1">A</a>
<a href="https://substack.com/inbox" time_added="2">B</a>`;
    const result = parsePocketExport(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("https://writer.substack.com");
    expect(result.value).toContain("https://substack.com");
  });

  it("skips non-http(s) hrefs (mailto:, javascript:, data:)", () => {
    const html = `<a href="mailto:foo@example.com">Mail</a>
<a href="javascript:void(0)">JS</a>
<a href="data:text/plain,hello">Data</a>
<a href="https://example.com/article" time_added="1">Real</a>`;
    const result = parsePocketExport(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(["https://example.com"]);
  });

  it("returns err on empty input", () => {
    const result = parsePocketExport("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/empty/i);
  });

  it("returns err when the file contains no links", () => {
    const result = parsePocketExport("<html><body><p>Nothing here</p></body></html>");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no saved links/i);
  });

  it("returns err when every href is non-http(s)", () => {
    const result = parsePocketExport(
      '<a href="mailto:a@b.com">x</a><a href="javascript:1">y</a>',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no valid http/i);
  });
});
