import { describe, it, expect } from "vitest";
import {
  parseOpmlFile,
  generateOpmlFile,
  generateUrlList,
} from "../../../src/core/opml/opml-service.ts";
import { isOk, isErr, unwrap } from "../../../src/utils/result.ts";
import type { Feed } from "../../../src/types/index.ts";

// Sample OPML with multiple feeds
const SAMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Subscriptions</title>
  </head>
  <body>
    <outline type="rss" text="TechCrunch" title="TechCrunch" xmlUrl="https://techcrunch.com/feed/" htmlUrl="https://techcrunch.com/"/>
    <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com/"/>
    <outline type="rss" text="The Verge" xmlUrl="https://www.theverge.com/rss/index.xml"/>
  </body>
</opml>`;

// OPML with nested folders (should be flattened)
const NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Organized Feeds</title>
  </head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="TechCrunch" xmlUrl="https://techcrunch.com/feed/"/>
      <outline type="rss" text="Ars Technica" xmlUrl="https://feeds.arstechnica.com/arstechnica/features"/>
    </outline>
    <outline text="News">
      <outline type="rss" text="BBC" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"/>
    </outline>
  </body>
</opml>`;

// Non-OPML content (completely invalid)
const NON_OPML_CONTENT = `This is just plain text, not XML at all { json: "nope" }`;

// Mock feeds for testing generation
function createMockFeed(url: string, title: string, siteUrl: string): Feed {
  const now = Date.now();
  return {
    id: `feed-${now}`,
    url,
    title,
    description: "",
    siteUrl,
    createdAt: now,
    updatedAt: now,
  };
}

describe("opml-service", () => {
  describe("parseOpmlFile", () => {
    it("should parse valid OPML and extract feed entries", () => {
      const result = parseOpmlFile(SAMPLE_OPML);
      expect(isOk(result)).toBe(true);

      const feeds = unwrap(result);
      expect(feeds).toHaveLength(3);

      expect(feeds[0]).toEqual({
        title: "TechCrunch",
        xmlUrl: "https://techcrunch.com/feed/",
        htmlUrl: "https://techcrunch.com/",
      });

      expect(feeds[1]).toEqual({
        title: "Hacker News",
        xmlUrl: "https://news.ycombinator.com/rss",
        htmlUrl: "https://news.ycombinator.com/",
      });

      // The Verge only has text, no title
      expect(feeds[2]).toEqual({
        title: "The Verge",
        xmlUrl: "https://www.theverge.com/rss/index.xml",
        htmlUrl: undefined,
      });
    });

    it("should PRESERVE folder structure (PR E) — feeds carry their parent folder name", () => {
      // Was: parser flattened nested folders, dropping the organization the
      // user had spent years building in their previous reader. PR E
      // captures the immediate parent <outline>'s text/title as folderName
      // so the importer can recreate folders on the destination side.
      const result = parseOpmlFile(NESTED_OPML);
      expect(isOk(result)).toBe(true);

      const feeds = unwrap(result);
      expect(feeds).toHaveLength(3);

      const techcrunch = feeds.find(
        (f) => f.xmlUrl === "https://techcrunch.com/feed/",
      );
      const ars = feeds.find(
        (f) => f.xmlUrl === "https://feeds.arstechnica.com/arstechnica/features",
      );
      const bbc = feeds.find(
        (f) => f.xmlUrl === "https://feeds.bbci.co.uk/news/rss.xml",
      );
      expect(techcrunch?.folderName).toBe("Tech");
      expect(ars?.folderName).toBe("Tech");
      expect(bbc?.folderName).toBe("News");
    });

    it("top-level (unfiled) feeds get folderName=undefined", () => {
      const result = parseOpmlFile(SAMPLE_OPML);
      expect(isOk(result)).toBe(true);
      const feeds = unwrap(result);
      for (const f of feeds) {
        expect(f.folderName).toBeUndefined();
      }
    });

    it("should return error for non-OPML content", () => {
      const result = parseOpmlFile(NON_OPML_CONTENT);
      expect(isErr(result)).toBe(true);
    });

    it("should return error for empty input", () => {
      const result = parseOpmlFile("");
      expect(isErr(result)).toBe(true);
    });

    it("should return empty array for OPML with no feeds", () => {
      const emptyOpml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Empty</title></head>
  <body></body>
</opml>`;
      const result = parseOpmlFile(emptyOpml);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toHaveLength(0);
    });

    it("should skip outlines without xmlUrl", () => {
      const opmlWithFolders = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Folder"/>
    <outline text="Feed" xmlUrl="https://example.com/feed"/>
  </body>
</opml>`;
      const result = parseOpmlFile(opmlWithFolders);
      expect(isOk(result)).toBe(true);

      const feeds = unwrap(result);
      expect(feeds).toHaveLength(1);
      expect(feeds[0].xmlUrl).toBe("https://example.com/feed");
    });
  });

  describe("generateOpmlFile — folder grouping (PR E)", () => {
    it("groups feeds inside <outline> parent groups when folders are provided", () => {
      // PR E: round-trip fidelity. Export must mirror the import shape so
      // a user can move feeds between readers without losing organization.
      const now = Date.now();
      const folders = [
        { id: "fld-tech", name: "Tech", createdAt: now },
        { id: "fld-news", name: "News", createdAt: now },
      ];
      const feeds: Feed[] = [
        {
          id: "f-tc",
          url: "https://techcrunch.com/feed/",
          title: "TechCrunch",
          description: "",
          siteUrl: "https://techcrunch.com/",
          folderId: "fld-tech",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "f-bbc",
          url: "https://feeds.bbci.co.uk/news/rss.xml",
          title: "BBC",
          description: "",
          siteUrl: "https://www.bbc.com/",
          folderId: "fld-news",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "f-unfiled",
          url: "https://example.com/feed",
          title: "Unfiled Example",
          description: "",
          siteUrl: "",
          createdAt: now,
          updatedAt: now,
        },
      ];

      const opml = generateOpmlFile(feeds, folders);

      // Folder outlines exist as wrappers (no xmlUrl, text=folder name)
      expect(opml).toMatch(/<outline[^>]*text="Tech"[^>]*>[\s\S]*TechCrunch/);
      expect(opml).toMatch(/<outline[^>]*text="News"[^>]*>[\s\S]*BBC/);
      // Unfiled feeds stay at top level (not inside any folder)
      expect(opml).toContain("Unfiled Example");
    });

    it("round-trip: parse → generate → parse preserves folder membership", () => {
      const now = Date.now();
      const folders = [{ id: "fld-tech", name: "Tech", createdAt: now }];
      const feeds: Feed[] = [
        {
          id: "f-tc",
          url: "https://techcrunch.com/feed/",
          title: "TechCrunch",
          description: "",
          siteUrl: "",
          folderId: "fld-tech",
          createdAt: now,
          updatedAt: now,
        },
      ];

      const opml = generateOpmlFile(feeds, folders);
      const reparsed = parseOpmlFile(opml);
      expect(isOk(reparsed)).toBe(true);
      const entries = unwrap(reparsed);
      expect(entries).toHaveLength(1);
      expect(entries[0].folderName).toBe("Tech");
      expect(entries[0].xmlUrl).toBe("https://techcrunch.com/feed/");
    });

    it("called without folders arg keeps the old flat-list behavior", () => {
      const feeds = [
        createMockFeed(
          "https://example.com/feed",
          "Example",
          "https://example.com/",
        ),
      ];
      // Backwards compatible — older callers don't pass folders.
      const opml = generateOpmlFile(feeds);
      expect(opml).toContain("Example");
      expect(opml).toContain("https://example.com/feed");
    });
  });

  describe("generateOpmlFile", () => {
    it("should generate valid OPML from feeds array", () => {
      const feeds = [
        createMockFeed(
          "https://techcrunch.com/feed/",
          "TechCrunch",
          "https://techcrunch.com/",
        ),
        createMockFeed(
          "https://news.ycombinator.com/rss",
          "Hacker News",
          "https://news.ycombinator.com/",
        ),
      ];

      const opml = generateOpmlFile(feeds);

      // Verify it's valid XML with OPML structure
      expect(opml).toContain("<?xml");
      expect(opml).toContain("<opml");
      expect(opml).toContain("</opml>");
      expect(opml).toContain("FeedZero Subscriptions");

      // Verify it contains feed data
      expect(opml).toContain("https://techcrunch.com/feed/");
      expect(opml).toContain("TechCrunch");
      expect(opml).toContain("https://news.ycombinator.com/rss");
      expect(opml).toContain("Hacker News");
    });

    it("should generate valid OPML with htmlUrl for feeds that have siteUrl", () => {
      const feeds = [
        createMockFeed(
          "https://example.com/feed",
          "Example",
          "https://example.com/",
        ),
      ];

      const opml = generateOpmlFile(feeds);
      expect(opml).toContain('htmlUrl="https://example.com/"');
    });

    it("should handle feeds without siteUrl", () => {
      const now = Date.now();
      const feeds: Feed[] = [
        {
          id: "feed-1",
          url: "https://example.com/feed",
          title: "Example",
          description: "",
          siteUrl: "",
          createdAt: now,
          updatedAt: now,
        },
      ];

      const opml = generateOpmlFile(feeds);
      expect(opml).toContain('xmlUrl="https://example.com/feed"');
      expect(opml).toContain("Example");
    });

    it("should return valid OPML for empty feeds array", () => {
      const opml = generateOpmlFile([]);
      expect(opml).toContain("<opml");
      expect(opml).toContain("</opml>");
    });

    it("should produce OPML that can be re-parsed", () => {
      const feeds = [
        createMockFeed(
          "https://example.com/feed",
          "Example Feed",
          "https://example.com/",
        ),
      ];

      const opml = generateOpmlFile(feeds);
      const parseResult = parseOpmlFile(opml);

      expect(isOk(parseResult)).toBe(true);
      const parsed = unwrap(parseResult);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].xmlUrl).toBe("https://example.com/feed");
      expect(parsed[0].title).toBe("Example Feed");
    });
  });

  describe("generateUrlList", () => {
    it("should generate newline-separated URL list", () => {
      const feeds = [
        createMockFeed("https://a.com/feed", "A", "https://a.com"),
        createMockFeed("https://b.com/feed", "B", "https://b.com"),
        createMockFeed("https://c.com/feed", "C", "https://c.com"),
      ];

      const urls = generateUrlList(feeds);
      expect(urls).toBe(
        "https://a.com/feed\nhttps://b.com/feed\nhttps://c.com/feed",
      );
    });

    it("should return empty string for empty feeds array", () => {
      const urls = generateUrlList([]);
      expect(urls).toBe("");
    });

    it("should only include feed URLs, not site URLs", () => {
      const feeds = [
        createMockFeed(
          "https://feeds.example.com/rss.xml",
          "Example",
          "https://www.example.com/",
        ),
      ];

      const urls = generateUrlList(feeds);
      expect(urls).toBe("https://feeds.example.com/rss.xml");
      expect(urls).not.toContain("https://www.example.com/");
    });
  });
});
