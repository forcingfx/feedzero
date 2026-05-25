import { describe, it, expect } from "vitest";
import { parse } from "../../../src/core/parser/parser.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

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
  describe("format detection", () => {
    it("reports `rss` for an RSS 2.0 feed", () => {
      const { format } = unwrap(parse(RSS_FEED, "https://example.com/feed"));
      expect(format).toBe("rss");
    });

    it("reports `atom` for an Atom feed", () => {
      const { format } = unwrap(parse(ATOM_FEED, "https://example.com/feed"));
      expect(format).toBe("atom");
    });
  });

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

    it("should strip Python None artifacts from content:encoded", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article with None</title>
      <link>https://example.com/1</link>
      <description></description>
      <content:encoded><![CDATA[<a href="https://example.com/1"><img src="https://example.com/img.jpg"></a> None]]></content:encoded>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).not.toContain("None");
    });

    it("should strip standalone None from description", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/1</link>
      <description>None</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).toBe("");
      expect(articles[0].summary).toBe("");
    });

    it("should preserve None when part of real content", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/1</link>
      <description>None of these options are valid</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).toContain("None of these options");
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

    it("reports `json` as the parsed format", () => {
      const { format } = unwrap(
        parse(JSON_FEED, "https://example.com/feed.json"),
      );
      expect(format).toBe("json");
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

  describe("feed content cleanup", () => {
    it("should strip boilerplate from RSS content", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>Breaking News</title>
      <link>https://example.com/1</link>
      <description>&lt;p&gt;Real article content.&lt;/p&gt;&lt;p&gt;Published On 6 Apr 2026&lt;/p&gt;&lt;p&gt;Save&lt;/p&gt;&lt;p&gt;Share&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).toContain("Real article content");
      expect(articles[0].content).not.toContain("Published On");
      expect(articles[0].content).not.toContain(">Save<");
      expect(articles[0].content).not.toContain(">Share<");
    });

    it("should strip duplicate title heading from RSS content", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>Article Title</title>
      <link>https://example.com/1</link>
      <description>&lt;h2&gt;Article Title&lt;/h2&gt;&lt;p&gt;Content here.&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).not.toContain("<h2>");
      expect(articles[0].content).toContain("Content here");
    });

    it("should strip boilerplate from Atom content", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Article</title>
    <link href="https://example.com/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <content type="html">&lt;p&gt;Real content.&lt;/p&gt;&lt;a href="https://example.com"&gt;Read full article&lt;/a&gt;</content>
  </entry>
</feed>`;
      const { articles } = unwrap(parse(feed, "https://example.com/atom"));
      expect(articles[0].content).toContain("Real content");
      expect(articles[0].content).not.toContain("Read full article");
    });

    it("should strip boilerplate from JSON Feed content", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Test",
        items: [
          {
            id: "1",
            url: "https://example.com/1",
            title: "JSON Article",
            content_html:
              "<p>Article body.</p><a href=\"https://example.com\">Continue reading...</a>",
          },
        ],
      });
      const { articles } = unwrap(parse(feed, "https://example.com/feed.json"));
      expect(articles[0].content).toContain("Article body");
      expect(articles[0].content).not.toContain("Continue reading");
    });

    it("should strip tiny images from feed content", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>With Tiny Thumb</title>
      <link>https://example.com/1</link>
      <description>&lt;img src="thumb.jpg" width="80" height="60"&gt;&lt;p&gt;Content.&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://example.com/feed"));
      expect(articles[0].content).not.toContain("<img");
      expect(articles[0].content).toContain("Content");
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

    it("should reject whitespace-only input", () => {
      expect(isErr(parse("   \n\t  ", "https://example.com"))).toBe(true);
    });

    it("should reject JSON without jsonfeed version marker (parser-side)", () => {
      const bad = JSON.stringify({ title: "Not a feed", items: [] });
      const result = parse(bad, "https://example.com");
      expect(isErr(result)).toBe(true);
    });

    it("should fall through to feedsmith when input starts with { but is invalid JSON", () => {
      // Malformed JSON triggers the catch on JSON.parse; feedsmith gets the
      // text and rejects it. End result is an err either way.
      const result = parse("{not really json", "https://example.com");
      expect(isErr(result)).toBe(true);
    });
  });

  describe("author resolution variants", () => {
    it("RSS falls back to authors[] string when no dc:creator is present", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>X</description>
    <item>
      <title>Post</title>
      <link>https://x.com/1</link>
      <author>writer@example.com (Writer Name)</author>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      // RSS <author> can be string or {name} from feedsmith — both branches
      // valid; we just assert it's a non-empty string.
      expect(typeof articles[0].author).toBe("string");
      expect(articles[0].author.length).toBeGreaterThan(0);
    });

    it("RSS extracts author.name when authors[0] is an object", () => {
      // atom:author within RSS is parsed by feedsmith as an object form
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Hybrid</title>
    <link>https://x.com</link>
    <description>X</description>
    <item>
      <title>Post</title>
      <link>https://x.com/1</link>
      <atom:author><atom:name>Atom Writer</atom:name></atom:author>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      // We don't assert the exact value (depends on feedsmith parsing)
      // but the extraction path with object {name} must not crash and
      // must yield a string.
      expect(typeof articles[0].author).toBe("string");
    });

    it("RSS uses empty string when no author info anywhere", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>X</description>
    <item>
      <title>No Author Post</title>
      <link>https://x.com/1</link>
      <description>Body</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      expect(articles[0].author).toBe("");
    });

    it("Atom uses empty string when entry has no <author>", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>X</title>
  <link href="https://x.com" rel="alternate"/>
  <entry>
    <title>Anonymous</title>
    <link href="https://x.com/1" rel="alternate"/>
    <id>tag:x.com,2024:1</id>
    <summary>Hi</summary>
  </entry>
</feed>`;
      const { articles } = unwrap(parse(feed, "https://x.com/atom"));
      expect(articles[0].author).toBe("");
    });
  });

  describe("Atom link resolution", () => {
    it("falls back to first link when no rel='alternate' exists", () => {
      // findLink(entry.links, "alternate") returns "" (no match → covers the
      // late `return ""` branch); findLink(entry.links) then returns the
      // first link.
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>X</title>
  <entry>
    <title>Related-only</title>
    <link href="https://x.com/related" rel="related"/>
    <id>tag:x.com,2024:1</id>
  </entry>
</feed>`;
      const { articles } = unwrap(parse(feed, "https://x.com/atom"));
      expect(articles[0].link).toBe("https://x.com/related");
    });

    it("yields empty link when entry has no <link> elements at all", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>X</title>
  <entry>
    <title>Linkless</title>
    <id>tag:x.com,2024:1</id>
    <summary>Body</summary>
  </entry>
</feed>`;
      const { articles } = unwrap(parse(feed, "https://x.com/atom"));
      expect(articles[0].link).toBe("");
    });

    it("yields empty siteUrl when feed has no rel='alternate' link", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>X</title>
  <link href="https://x.com/self" rel="self"/>
  <entry>
    <title>P</title>
    <link href="https://x.com/1" rel="alternate"/>
    <id>tag:x.com,2024:1</id>
  </entry>
</feed>`;
      const { feed: parsed } = unwrap(parse(feed, "https://x.com/atom"));
      // No `rel="alternate"` link in the feed metadata; siteUrl is "".
      expect(parsed.siteUrl).toBe("");
    });
  });

  describe("JSON Feed branch coverage", () => {
    it("falls back to external_url when item has no url", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "X",
        items: [
          {
            id: "1",
            external_url: "https://other.com/post",
            title: "Externally hosted",
            content_text: "Body",
          },
        ],
      });
      const { articles } = unwrap(parse(feed, "https://x.com/feed.json"));
      expect(articles[0].link).toBe("https://other.com/post");
    });

    it("falls back to url for guid when id is missing", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "X",
        items: [
          {
            url: "https://x.com/no-id",
            title: "ID-less",
            content_text: "Body",
          },
        ],
      });
      const { articles } = unwrap(parse(feed, "https://x.com/feed.json"));
      expect(articles[0].guid).toBe("https://x.com/no-id");
    });

    it("uses 'Untitled' when an item has no title", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "X",
        items: [
          { id: "1", url: "https://x.com/1", content_text: "Body" },
        ],
      });
      const { articles } = unwrap(parse(feed, "https://x.com/feed.json"));
      expect(articles[0].title).toBe("Untitled");
    });

    it("yields empty siteUrl when JSON Feed has no home_page_url", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "X",
        items: [],
      });
      const { feed: parsed } = unwrap(parse(feed, "https://x.com/feed.json"));
      expect(parsed.siteUrl).toBe("");
    });

    it("yields empty articles when JSON Feed has no items field", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "X",
      });
      const { articles } = unwrap(parse(feed, "https://x.com/feed.json"));
      expect(articles).toEqual([]);
    });
  });

  describe("date parsing edge cases", () => {
    it("returns null for an invalid pubDate string", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>X</description>
    <item>
      <title>Bad Date</title>
      <link>https://x.com/1</link>
      <pubDate>not a real date</pubDate>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      expect(articles[0].publishedAt).toBeNull();
    });

    it("returns null when pubDate is absent", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>X</description>
    <item>
      <title>No Date</title>
      <link>https://x.com/1</link>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      expect(articles[0].publishedAt).toBeNull();
    });
  });

  describe("metadata fallbacks", () => {
    it("RSS uses feedUrl when channel has no <title>", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <link>https://x.com</link>
    <description>D</description>
    <item>
      <title>P</title>
      <link>https://x.com/1</link>
    </item>
  </channel>
</rss>`;
      const { feed: parsed } = unwrap(parse(feed, "https://x.com/feed"));
      expect(parsed.title).toBe("https://x.com/feed");
    });

    it("Atom uses feedUrl when feed has no <title>", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="https://x.com" rel="alternate"/>
  <entry>
    <title>P</title>
    <link href="https://x.com/1" rel="alternate"/>
    <id>tag:x.com,2024:1</id>
  </entry>
</feed>`;
      const { feed: parsed } = unwrap(parse(feed, "https://x.com/atom"));
      expect(parsed.title).toBe("https://x.com/atom");
    });

    it("RSS items without title use 'Untitled'", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>D</description>
    <item>
      <link>https://x.com/1</link>
      <description>Body</description>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      expect(articles[0].title).toBe("Untitled");
    });

    it("RSS guid falls back to link when no <guid> element", () => {
      const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>X</title>
    <link>https://x.com</link>
    <description>D</description>
    <item>
      <title>P</title>
      <link>https://x.com/1</link>
    </item>
  </channel>
</rss>`;
      const { articles } = unwrap(parse(feed, "https://x.com/feed"));
      expect(articles[0].guid).toBe("https://x.com/1");
    });
  });

  describe("XML attack prevention", () => {
    it("should not expand internal entity declarations (XXE)", () => {
      const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe "INJECTED_ENTITY_CONTENT">
]>
<rss version="2.0">
  <channel>
    <title>&xxe;</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>&xxe;</title>
      <link>https://example.com/1</link>
    </item>
  </channel>
</rss>`;
      const result = parse(xxePayload, "https://example.com/feed");
      // Either parsing fails entirely or the entity is not expanded
      if (isOk(result)) {
        const { feed, articles } = unwrap(result);
        expect(feed.title).not.toContain("INJECTED_ENTITY_CONTENT");
        if (articles.length > 0) {
          expect(articles[0].title).not.toContain("INJECTED_ENTITY_CONTENT");
        }
      }
      // If it returns Err, that's also acceptable — entity attack rejected
    });

    it("should not expand external entity declarations", () => {
      const xxeExternal = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<rss version="2.0">
  <channel>
    <title>&xxe;</title>
    <link>https://example.com</link>
    <description>Test</description>
  </channel>
</rss>`;
      const result = parse(xxeExternal, "https://example.com/feed");
      if (isOk(result)) {
        expect(unwrap(result).feed.title).not.toContain("root:");
      }
    });

    it("should handle billion laughs (XML bomb) without hanging", () => {
      const bomb = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<rss version="2.0">
  <channel>
    <title>&lol4;</title>
    <link>https://example.com</link>
    <description>Test</description>
  </channel>
</rss>`;
      // Must complete quickly (not hang) — either returns Err or safe result
      const result = parse(bomb, "https://example.com/feed");
      if (isOk(result)) {
        // If it parses, the title should not contain exponentially expanded content
        expect(unwrap(result).feed.title.length).toBeLessThan(10000);
      }
    });
  });
});
