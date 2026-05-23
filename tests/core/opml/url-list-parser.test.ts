import { describe, it, expect } from "vitest";
import {
  parseUrlList,
  isOpmlFormat,
} from "../../../src/core/opml/url-list-parser.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

describe("url-list-parser", () => {
  describe("parseUrlList", () => {
    it("should parse simple newline-separated URLs", () => {
      const input = `https://example.com/feed
https://another.com/rss
https://third.com/atom.xml`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);

      const urls = unwrap(result);
      expect(urls).toHaveLength(3);
      expect(urls).toContain("https://example.com/feed");
      expect(urls).toContain("https://another.com/rss");
      expect(urls).toContain("https://third.com/atom.xml");
    });

    it("should handle Windows-style line endings (CRLF)", () => {
      const input = "https://a.com/feed\r\nhttps://b.com/feed\r\nhttps://c.com/feed";

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toHaveLength(3);
    });

    it("should skip empty lines", () => {
      const input = `https://example.com/feed

https://another.com/rss

`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toHaveLength(2);
    });

    it("should skip comment lines starting with #", () => {
      const input = `# My feed list
https://example.com/feed
# Another comment
https://another.com/rss`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);

      const urls = unwrap(result);
      expect(urls).toHaveLength(2);
      expect(urls).not.toContain("# My feed list");
      expect(urls).not.toContain("# Another comment");
    });

    it("should trim whitespace from URLs", () => {
      const input = `  https://example.com/feed
	https://another.com/rss	`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);

      const urls = unwrap(result);
      expect(urls[0]).toBe("https://example.com/feed");
      expect(urls[1]).toBe("https://another.com/rss");
    });

    it("should accept http URLs", () => {
      const input = "http://example.com/feed";

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toContain("http://example.com/feed");
    });

    it("should auto-prefix URLs without protocol with https", () => {
      const input = "example.com/feed";

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toContain("https://example.com/feed");
    });

    it("should filter out invalid URLs", () => {
      const input = `https://valid.com/feed
not a url at all
https://another-valid.com/rss
just some text`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);

      const urls = unwrap(result);
      expect(urls).toHaveLength(2);
      expect(urls).toContain("https://valid.com/feed");
      expect(urls).toContain("https://another-valid.com/rss");
    });

    it("should return error for empty input", () => {
      const result = parseUrlList("");
      expect(isErr(result)).toBe(true);
    });

    it("should return error for whitespace-only input", () => {
      const result = parseUrlList("   \n\n  \t  ");
      expect(isErr(result)).toBe(true);
    });

    it("should return error when no valid URLs found", () => {
      const input = `# Just comments
# And more comments
not a valid url`;

      const result = parseUrlList(input);
      expect(isErr(result)).toBe(true);
    });

    it("should handle single URL", () => {
      const input = "https://example.com/feed";

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual(["https://example.com/feed"]);
    });

    it("should deduplicate URLs", () => {
      const input = `https://example.com/feed
https://example.com/feed
https://another.com/rss
https://example.com/feed`;

      const result = parseUrlList(input);
      expect(isOk(result)).toBe(true);

      const urls = unwrap(result);
      expect(urls).toHaveLength(2);
    });
  });

  describe("isOpmlFormat", () => {
    it("should return true for XML declaration", () => {
      expect(isOpmlFormat('<?xml version="1.0"?><opml>...')).toBe(true);
    });

    it("should return true for content containing <opml tag", () => {
      expect(isOpmlFormat("<opml version='2.0'>")).toBe(true);
    });

    it("should return true for whitespace-prefixed XML", () => {
      expect(isOpmlFormat('  \n  <?xml version="1.0"?>')).toBe(true);
    });

    it("should return false for plain URL list", () => {
      expect(isOpmlFormat("https://example.com/feed\nhttps://another.com/rss")).toBe(
        false,
      );
    });

    it("should return false for empty string", () => {
      expect(isOpmlFormat("")).toBe(false);
    });

    it("should return false for JSON", () => {
      expect(isOpmlFormat('{"feeds": []}')).toBe(false);
    });
  });
});
