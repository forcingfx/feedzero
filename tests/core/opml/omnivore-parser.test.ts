import { describe, it, expect } from "vitest";
import {
  parseOmnivoreExport,
  isOmnivoreExport,
} from "../../../src/core/opml/omnivore-parser.ts";

/**
 * Omnivore's "Export Library" produced a ZIP containing per-article JSON
 * files plus a `metadata.json` index. The index is an array of objects
 * with at least a `url` or `originalUrl` field per article. We accept
 * either the metadata.json index, an individual article JSON, or an
 * array of either — and walk the structure looking for URL fields.
 *
 * Format is documented; Omnivore is shut down so it is frozen.
 */

const SAMPLE_OMNIVORE_METADATA = JSON.stringify([
  {
    id: "abc-1",
    slug: "nyt-piece",
    title: "An NYT piece",
    url: "https://www.nytimes.com/2024/04/01/world/example.html",
    savedAt: "2024-04-01T12:00:00Z",
  },
  {
    id: "abc-2",
    slug: "guardian-piece",
    title: "A Guardian piece",
    url: "https://www.theguardian.com/article-1",
    savedAt: "2024-04-02T12:00:00Z",
  },
  {
    id: "abc-3",
    slug: "another-nyt",
    title: "Another NYT piece",
    url: "https://www.nytimes.com/2024/04/03/world/another.html",
    savedAt: "2024-04-03T12:00:00Z",
  },
]);

describe("isOmnivoreExport", () => {
  it("recognises a metadata.json array with url + savedAt fields", () => {
    expect(isOmnivoreExport(SAMPLE_OMNIVORE_METADATA)).toBe(true);
  });

  it("recognises a single article JSON with the Omnivore shape", () => {
    const single = JSON.stringify({
      id: "abc-1",
      slug: "x",
      url: "https://example.com/a",
      savedAt: "2024-01-01T00:00:00Z",
    });
    expect(isOmnivoreExport(single)).toBe(true);
  });

  it("rejects an array of plain URL strings (URL-list format)", () => {
    expect(isOmnivoreExport('["https://a.com", "https://b.com"]')).toBe(false);
  });

  it("rejects non-JSON input", () => {
    expect(isOmnivoreExport("<html></html>")).toBe(false);
    expect(isOmnivoreExport("https://example.com")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isOmnivoreExport("")).toBe(false);
  });
});

describe("parseOmnivoreExport", () => {
  it("extracts unique origins from an Omnivore metadata array", () => {
    const result = parseOmnivoreExport(SAMPLE_OMNIVORE_METADATA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      "https://www.nytimes.com",
      "https://www.theguardian.com",
    ]);
  });

  it("falls back to originalUrl when url is absent", () => {
    const json = JSON.stringify([
      { originalUrl: "https://example.com/a", savedAt: "2024-01-01" },
      { originalUrl: "https://example.com/b", savedAt: "2024-01-02" },
    ]);
    const result = parseOmnivoreExport(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(["https://example.com"]);
  });

  it("accepts a single article JSON object", () => {
    const single = JSON.stringify({
      url: "https://example.com/article",
      savedAt: "2024-01-01",
    });
    const result = parseOmnivoreExport(single);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(["https://example.com"]);
  });

  it("preserves subdomains as distinct origins", () => {
    const json = JSON.stringify([
      { url: "https://blog.example.com/a" },
      { url: "https://example.com/b" },
    ]);
    const result = parseOmnivoreExport(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("https://blog.example.com");
    expect(result.value).toContain("https://example.com");
  });

  it("skips non-http(s) URLs", () => {
    const json = JSON.stringify([
      { url: "javascript:void(0)" },
      { url: "mailto:foo@bar.com" },
      { url: "https://example.com/article" },
    ]);
    const result = parseOmnivoreExport(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(["https://example.com"]);
  });

  it("returns err on empty input", () => {
    const result = parseOmnivoreExport("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/empty/i);
  });

  it("returns err on invalid JSON", () => {
    const result = parseOmnivoreExport("not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/parse|json/i);
  });

  it("returns err when no URL fields are found", () => {
    const result = parseOmnivoreExport(
      JSON.stringify([{ title: "no url field here" }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no .* url/i);
  });
});
