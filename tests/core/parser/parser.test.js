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

const RSS_WITH_CONTENT_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Namespaced Feed</title>
    <link>https://example.com</link>
    <description>Feed with content:encoded</description>
    <item>
      <title>Full Content Post</title>
      <link>https://example.com/post/1</link>
      <description>A short summary of the post.</description>
      <content:encoded>&lt;p&gt;This is the full article content with &lt;strong&gt;rich HTML&lt;/strong&gt; that is much longer than the description summary.&lt;/p&gt;&lt;p&gt;It has multiple paragraphs and formatting.&lt;/p&gt;</content:encoded>
      <dc:creator>Alice</dc:creator>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const RSS_DOUBLE_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ben&amp;#39;s Blog</title>
    <link>https://example.com</link>
    <description>A feed with double-encoded entities</description>
    <item>
      <title>It&amp;#39;s a &amp;quot;test&amp;quot;</title>
      <link>https://example.com/1</link>
      <description>Entities &amp;amp; more &amp;#39;stuff&amp;#39;</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_DOUBLE_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>She&amp;#39;s Blog</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>She&amp;#39;s Here &amp;amp; Ready</title>
    <link href="https://example.com/atom/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <summary>An entry with &amp;#39;entities&amp;#39;</summary>
    <content type="html">&lt;p&gt;Content&lt;/p&gt;</content>
    <author><name>Jane &amp;amp; John</name></author>
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

    it("should prefer content:encoded over description", () => {
      const { articles } = unwrap(
        parse(RSS_WITH_CONTENT_ENCODED, "https://example.com/feed"),
      );
      expect(articles[0].content).toContain("full article content");
      expect(articles[0].content).toContain("multiple paragraphs");
      // content should NOT be the short description
      expect(articles[0].content).not.toBe(articles[0].summary);
      expect(articles[0].content.length).toBeGreaterThan(
        articles[0].summary.length,
      );
    });

    it("should extract dc:creator as author", () => {
      const { articles } = unwrap(
        parse(RSS_WITH_CONTENT_ENCODED, "https://example.com/feed"),
      );
      expect(articles[0].author).toBe("Alice");
    });

    it("should decode double-encoded entities in titles and descriptions", () => {
      const result = parse(RSS_DOUBLE_ENCODED, "https://example.com/feed");
      const { feed, articles } = unwrap(result);
      expect(feed.title).toBe("Ben's Blog");
      expect(articles[0].title).toBe('It\'s a "test"');
      expect(articles[0].summary).toContain("Entities & more");
      expect(articles[0].summary).toContain("'stuff'");
    });

    it("should keep summary separate from content:encoded", () => {
      const { articles } = unwrap(
        parse(RSS_WITH_CONTENT_ENCODED, "https://example.com/feed"),
      );
      expect(articles[0].summary).toContain("short summary");
      expect(articles[0].summary).not.toContain("multiple paragraphs");
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

    it("should decode double-encoded entities in Atom feeds", () => {
      const { feed, articles } = unwrap(
        parse(ATOM_DOUBLE_ENCODED, "https://example.com/atom"),
      );
      expect(feed.title).toBe("She's Blog");
      expect(articles[0].title).toBe("She's Here & Ready");
      expect(articles[0].author).toBe("Jane & John");
    });
  });

  describe("JSON Feed 1.1", () => {
    const JSON_FEED = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Example JSON Feed",
      home_page_url: "https://example.com",
      description: "A test JSON feed",
      items: [
        {
          id: "https://example.com/post/1",
          url: "https://example.com/post/1",
          title: "First JSON Post",
          content_html: "<p>HTML content here</p>",
          summary: "A summary",
          date_published: "2024-01-15T12:00:00Z",
          authors: [{ name: "Alice" }],
        },
        {
          id: "https://example.com/post/2",
          url: "https://example.com/post/2",
          title: "Second JSON Post",
          content_text: "Plain text content",
          date_published: "2024-01-14T12:00:00Z",
          author: { name: "Alice" },
        },
      ],
    });

    it("should parse feed metadata", () => {
      const result = parse(JSON_FEED, "https://example.com/feed.json");
      expect(isOk(result)).toBe(true);
      const { feed } = unwrap(result);
      expect(feed.title).toBe("Example JSON Feed");
      expect(feed.description).toBe("A test JSON feed");
      expect(feed.siteUrl).toBe("https://example.com");
      expect(feed.url).toBe("https://example.com/feed.json");
    });

    it("should parse items", () => {
      const { articles } = unwrap(
        parse(JSON_FEED, "https://example.com/feed.json"),
      );
      expect(articles).toHaveLength(2);
      expect(articles[0].title).toBe("First JSON Post");
      expect(articles[0].link).toBe("https://example.com/post/1");
      expect(articles[0].author).toBe("Alice");
      expect(articles[0].publishedAt).toBeGreaterThan(0);
    });

    it("should prefer content_html over content_text", () => {
      const { articles } = unwrap(
        parse(JSON_FEED, "https://example.com/feed.json"),
      );
      expect(articles[0].content).toContain("HTML content here");
    });

    it("should fall back to content_text", () => {
      const { articles } = unwrap(
        parse(JSON_FEED, "https://example.com/feed.json"),
      );
      expect(articles[1].content).toBe("Plain text content");
    });

    it("should sanitize HTML content", () => {
      const feedWithScript = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Test",
        items: [
          {
            id: "1",
            url: "https://example.com/1",
            title: "Bad",
            content_html: "<p>Hello</p><script>var x = 1;</script>",
          },
        ],
      });
      const { articles } = unwrap(parse(feedWithScript, "https://example.com"));
      expect(articles[0].content).not.toContain("<script>");
      expect(articles[0].content).toContain("Hello");
    });

    it("should support legacy author field", () => {
      const { articles } = unwrap(
        parse(JSON_FEED, "https://example.com/feed.json"),
      );
      expect(articles[1].author).toBe("Alice");
    });

    it("should reject JSON without jsonfeed version", () => {
      const bad = JSON.stringify({ title: "Not a feed", items: [] });
      const result = parse(bad, "https://example.com");
      expect(isErr(result)).toBe(true);
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
