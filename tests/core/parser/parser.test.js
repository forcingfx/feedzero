import { describe, it, expect } from "vitest";
import { parse } from "../../../src/core/parser/parser.js";
import { isOk, isErr, unwrap } from "../../../src/utils/result.js";

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <description>An example RSS feed</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/1</link>
      <description>&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/1</guid>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/2</link>
      <description>&lt;p&gt;Another post&lt;/p&gt;&lt;script&gt;var x = 1;&lt;/script&gt;</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <subtitle>An example Atom feed</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <summary>Summary text</summary>
    <content type="html">&lt;p&gt;Full content&lt;/p&gt;</content>
    <author><name>Jane Doe</name></author>
  </entry>
</feed>`;

describe("Parser", () => {
  describe("RSS 2.0", () => {
    it("should parse feed metadata", () => {
      const result = parse(RSS_FEED, "https://example.com/feed");
      expect(isOk(result)).toBe(true);
      const { feed } = unwrap(result);
      expect(feed.title).toBe("Example Feed");
      expect(feed.description).toBe("An example RSS feed");
      expect(feed.siteUrl).toBe("https://example.com");
      expect(feed.url).toBe("https://example.com/feed");
    });

    it("should parse articles", () => {
      const { articles } = unwrap(parse(RSS_FEED, "https://example.com/feed"));
      expect(articles).toHaveLength(2);
      expect(articles[0].title).toBe("First Post");
      expect(articles[0].link).toBe("https://example.com/1");
      expect(articles[0].publishedAt).toBeGreaterThan(0);
    });

    it("should sanitize article content", () => {
      const { articles } = unwrap(parse(RSS_FEED, "https://example.com/feed"));
      expect(articles[1].content).not.toContain("<script>");
      expect(articles[1].content).toContain("Another post");
    });
  });

  describe("Atom 1.0", () => {
    it("should parse feed metadata", () => {
      const result = parse(ATOM_FEED, "https://example.com/atom");
      expect(isOk(result)).toBe(true);
      const { feed } = unwrap(result);
      expect(feed.title).toBe("Atom Feed");
      expect(feed.description).toBe("An example Atom feed");
      expect(feed.siteUrl).toBe("https://example.com");
    });

    it("should parse entries", () => {
      const { articles } = unwrap(parse(ATOM_FEED, "https://example.com/atom"));
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe("Atom Post");
      expect(articles[0].link).toBe("https://example.com/atom/1");
      expect(articles[0].author).toBe("Jane Doe");
      expect(articles[0].content).toContain("Full content");
    });
  });

  describe("error handling", () => {
    it("should reject invalid XML", () => {
      const result = parse("<not-a-feed>", "https://example.com");
      expect(isErr(result)).toBe(true);
    });

    it("should reject empty input", () => {
      expect(isErr(parse("", "https://example.com"))).toBe(true);
    });
  });
});
