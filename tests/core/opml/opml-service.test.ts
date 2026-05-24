import { describe, it, expect } from "vitest";
import {
  parseOpmlFile,
  generateOpmlFile,
  generateUrlList,
} from "../../../src/core/opml/opml-service.ts";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import type { Feed, Folder } from "@feedzero/core/types";

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

      const { entries } = unwrap(result);
      expect(entries).toHaveLength(3);

      expect(entries[0]).toEqual({
        title: "TechCrunch",
        xmlUrl: "https://techcrunch.com/feed/",
        htmlUrl: "https://techcrunch.com/",
      });

      expect(entries[1]).toEqual({
        title: "Hacker News",
        xmlUrl: "https://news.ycombinator.com/rss",
        htmlUrl: "https://news.ycombinator.com/",
      });

      // The Verge only has text, no title
      expect(entries[2]).toEqual({
        title: "The Verge",
        xmlUrl: "https://www.theverge.com/rss/index.xml",
        htmlUrl: undefined,
      });
    });

    it("PRESERVES folder structure — feeds carry their full folder path", () => {
      // Part 2 of the OPML field audit: instead of flattening to the
      // outermost parent name, we preserve the full ancestor path so
      // the importer can materialize nested folders via
      // `Folder.parentId`.
      const result = parseOpmlFile(NESTED_OPML);
      expect(isOk(result)).toBe(true);

      const { entries, folders } = unwrap(result);
      expect(entries).toHaveLength(3);

      const techcrunch = entries.find(
        (f) => f.xmlUrl === "https://techcrunch.com/feed/",
      );
      const ars = entries.find(
        (f) => f.xmlUrl === "https://feeds.arstechnica.com/arstechnica/features",
      );
      const bbc = entries.find(
        (f) => f.xmlUrl === "https://feeds.bbci.co.uk/news/rss.xml",
      );
      expect(techcrunch?.folderPath).toEqual(["Tech"]);
      expect(ars?.folderPath).toEqual(["Tech"]);
      expect(bbc?.folderPath).toEqual(["News"]);

      // Folder preamble: each folder appears exactly once, depth-first.
      const folderNames = folders.map((f) => f.name);
      expect(folderNames).toEqual(["Tech", "News"]);
    });

    it("top-level (unfiled) feeds get folderPath=undefined", () => {
      const result = parseOpmlFile(SAMPLE_OPML);
      expect(isOk(result)).toBe(true);
      const { entries } = unwrap(result);
      for (const f of entries) {
        expect(f.folderPath).toBeUndefined();
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

    it("should return empty entries for OPML with no feeds", () => {
      const emptyOpml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Empty</title></head>
  <body></body>
</opml>`;
      const result = parseOpmlFile(emptyOpml);
      expect(isOk(result)).toBe(true);
      const doc = unwrap(result);
      expect(doc.entries).toHaveLength(0);
      expect(doc.folders).toHaveLength(0);
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

      const { entries } = unwrap(result);
      expect(entries).toHaveLength(1);
      expect(entries[0].xmlUrl).toBe("https://example.com/feed");
    });

    describe("spec correctness — outlines we must skip per OPML 2.0", () => {
      // The OPML 2.0 spec says isComment="true" outlines are inert. Many
      // readers (NetNewsWire, ReadKit) use them to track unsubscribed-but-
      // remembered feeds. Importing them silently re-subscribes the user
      // every time they migrate readers — pure regression.
      it("skips outlines with isComment=\"true\"", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Active" xmlUrl="https://active.example.com/feed"/>
    <outline type="rss" text="Unsubscribed" xmlUrl="https://muted.example.com/feed" isComment="true"/>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { entries } = unwrap(result);
        expect(entries).toHaveLength(1);
        expect(entries[0].xmlUrl).toBe("https://active.example.com/feed");
      });

      // Per OPML 2.0: type="link" is a hyperlink reference (blogroll-style),
      // type="include" references an external OPML, type="directory" is a
      // listing. None are feed subscriptions; subscribing to them is wrong.
      it.each(["link", "include", "directory", "LINK", "Link"])(
        "skips outlines with type=%j",
        (typeValue) => {
          const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Subscribe" xmlUrl="https://feed.example.com/rss"/>
    <outline type="${typeValue}" text="Reference" xmlUrl="https://ref.example.com/page"/>
  </body>
</opml>`;
          const result = parseOpmlFile(opml);
          expect(isOk(result)).toBe(true);
          const { entries } = unwrap(result);
          expect(entries).toHaveLength(1);
          expect(entries[0].xmlUrl).toBe("https://feed.example.com/rss");
        },
      );

      // Belt-and-braces: type-undefined and uncommon types (e.g. "atom") are
      // STILL subscribed. Feedly omits `type` entirely on some exports; we
      // can't make them invisible just because the attribute is missing.
      it.each([undefined, "rss", "atom", "feed", "anything-custom"])(
        "still subscribes when type=%j",
        (typeValue) => {
          const typeAttr = typeValue === undefined ? "" : ` type="${typeValue}"`;
          const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline${typeAttr} text="A" xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
          const result = parseOpmlFile(opml);
          expect(isOk(result)).toBe(true);
          expect(unwrap(result).entries).toHaveLength(1);
        },
      );
    });

    describe("Part 2 — full outline field harvesting", () => {
      it("threads outline.description into entry.description", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed" description="Daily roundup of A news"/>
    <outline type="rss" text="B" xmlUrl="https://b.example.com/feed"/>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { entries } = unwrap(result);
        expect(entries[0].description).toBe("Daily roundup of A news");
        expect(entries[1].description).toBeUndefined();
      });

      it("splits outline.category on ',' into entry.tags (trimmed, deduped, empties dropped)", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed" category="tech, news, tech, ,frontend"/>
    <outline type="rss" text="B" xmlUrl="https://b.example.com/feed"/>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { entries } = unwrap(result);
        expect(entries[0].tags).toEqual(["tech", "news", "frontend"]);
        expect(entries[1].tags).toBeUndefined();
      });

      it("parses outline.created (RFC 822 or ISO 8601) into entry.createdAt ms", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed" created="Mon, 31 Oct 2016 12:00:00 GMT"/>
    <outline type="rss" text="B" xmlUrl="https://b.example.com/feed" created="2014-08-15T09:00:00Z"/>
    <outline type="rss" text="C" xmlUrl="https://c.example.com/feed" created="not a date"/>
    <outline type="rss" text="D" xmlUrl="https://d.example.com/feed"/>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { entries } = unwrap(result);
        // RFC 822 / ISO 8601 both parse to a positive epoch ms
        expect(entries[0].createdAt).toBe(Date.parse("Mon, 31 Oct 2016 12:00:00 GMT"));
        expect(entries[1].createdAt).toBe(Date.parse("2014-08-15T09:00:00Z"));
        // Malformed date → falls back to undefined (factory uses Date.now())
        expect(entries[2].createdAt).toBeUndefined();
        expect(entries[3].createdAt).toBeUndefined();
      });

      it("preserves deep nested folder paths and emits folders in depth-first order", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Frontend">
        <outline type="rss" text="React" xmlUrl="https://reactjs.org/feed"/>
      </outline>
      <outline type="rss" text="HN" xmlUrl="https://news.ycombinator.com/rss"/>
    </outline>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { entries, folders } = unwrap(result);
        const react = entries.find((e) => e.xmlUrl === "https://reactjs.org/feed");
        const hn = entries.find((e) => e.xmlUrl === "https://news.ycombinator.com/rss");
        expect(react?.folderPath).toEqual(["Tech", "Frontend"]);
        expect(hn?.folderPath).toEqual(["Tech"]);
        // Folders preamble: parents before children, no duplicates.
        expect(folders).toEqual([
          { name: "Tech", parentPath: [] },
          { name: "Frontend", parentPath: ["Tech"] },
        ]);
      });

      it("harvests <head> title / dateCreated / ownerName for ImportResults", () => {
        const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head>
    <title>My Subscriptions</title>
    <dateCreated>Fri, 24 May 2026 10:00:00 GMT</dateCreated>
    <ownerName>Maciek</ownerName>
  </head>
  <body>
    <outline type="rss" text="A" xmlUrl="https://a.example.com/feed"/>
  </body>
</opml>`;
        const result = parseOpmlFile(opml);
        expect(isOk(result)).toBe(true);
        const { head } = unwrap(result);
        expect(head.title).toBe("My Subscriptions");
        expect(head.ownerName).toBe("Maciek");
        // dateCreated is stringified (any representation feedsmith gives
        // us is fine for display; the importer doesn't act on it).
        expect(head.dateCreated).toBeDefined();
      });
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
      const { entries } = unwrap(reparsed);
      expect(entries).toHaveLength(1);
      expect(entries[0].folderPath).toEqual(["Tech"]);
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

  describe("generateOpmlFile — Part 3 lossless round-trip", () => {
    it("writes outline.description / category / created when present on Feed", () => {
      const feed: Feed = {
        id: "f-1",
        url: "https://example.com/feed",
        title: "Example",
        description: "A test feed",
        siteUrl: "https://example.com",
        tags: ["tech", "news"],
        createdAt: Date.parse("2014-08-15T09:00:00Z"),
        updatedAt: Date.now(),
      };
      const opml = generateOpmlFile([feed]);
      expect(opml).toContain('description="A test feed"');
      expect(opml).toContain('category="tech,news"');
      // RFC 822-stamped created attribute, derived from the createdAt ms.
      expect(opml).toContain(
        `created="${new Date(feed.createdAt).toUTCString()}"`,
      );
    });

    it("omits optional outline fields when absent from Feed", () => {
      const feed: Feed = {
        id: "f-1",
        url: "https://example.com/feed",
        title: "Example",
        description: "",
        siteUrl: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const opml = generateOpmlFile([feed]);
      expect(opml).not.toContain("description=");
      expect(opml).not.toContain("category=");
    });

    it("writes head.dateCreated but NEVER ownerName/ownerEmail/ownerId (privacy)", () => {
      const feed = createMockFeed("https://a.com/feed", "A", "");
      const opml = generateOpmlFile([feed]);
      expect(opml).toContain("<dateCreated>");
      // Privacy invariant — PII never leaves the device on export.
      expect(opml).not.toContain("<ownerName>");
      expect(opml).not.toContain("<ownerEmail>");
      expect(opml).not.toContain("<ownerId>");
    });

    it("nests folders that have a parentId so the tree round-trips", () => {
      // Tech > Frontend > React
      const now = Date.now();
      const tech: Folder = { id: "fld-tech", name: "Tech", createdAt: now };
      const frontend: Folder = {
        id: "fld-fe",
        name: "Frontend",
        createdAt: now,
        parentId: "fld-tech",
      };
      const react: Folder = {
        id: "fld-rx",
        name: "React",
        createdAt: now,
        parentId: "fld-fe",
      };
      const reactFeed: Feed = {
        id: "f-rx",
        url: "https://reactjs.org/feed",
        title: "React Blog",
        description: "",
        siteUrl: "",
        folderId: "fld-rx",
        createdAt: now,
        updatedAt: now,
      };

      const opml = generateOpmlFile([reactFeed], [tech, frontend, react]);
      // Reparse and confirm the path survives intact.
      const result = parseOpmlFile(opml);
      expect(isOk(result)).toBe(true);
      const { entries, folders } = unwrap(result);
      expect(entries[0].folderPath).toEqual(["Tech", "Frontend", "React"]);
      expect(folders).toEqual([
        { name: "Tech", parentPath: [] },
        { name: "Frontend", parentPath: ["Tech"] },
        { name: "React", parentPath: ["Tech", "Frontend"] },
      ]);
    });

    it("prunes empty folders so we don't emit dangling <outline> wrappers", () => {
      // "EmptyFolder" has no feeds. Should not appear in the export.
      const now = Date.now();
      const empty: Folder = {
        id: "fld-empty",
        name: "EmptyFolder",
        createdAt: now,
      };
      const tech: Folder = { id: "fld-tech", name: "Tech", createdAt: now };
      const feed: Feed = {
        id: "f-1",
        url: "https://a.example.com/feed",
        title: "A",
        description: "",
        siteUrl: "",
        folderId: "fld-tech",
        createdAt: now,
        updatedAt: now,
      };
      const opml = generateOpmlFile([feed], [empty, tech]);
      expect(opml).not.toContain("EmptyFolder");
    });

    it("full round-trip: every field we read on import is written on export", () => {
      // Build a Feed + Folder fixture with every audit-relevant field set,
      // export it, reparse, and assert the relevant subset survives.
      const now = Date.parse("2018-03-14T12:00:00Z");
      const techFolder: Folder = {
        id: "fld-tech",
        name: "Tech",
        createdAt: now,
      };
      const feFolder: Folder = {
        id: "fld-fe",
        name: "Frontend",
        createdAt: now,
        parentId: "fld-tech",
      };
      const feed: Feed = {
        id: "f-1",
        url: "https://reactjs.org/feed",
        title: "React Blog",
        description: "From the React team",
        siteUrl: "https://reactjs.org",
        folderId: "fld-fe",
        tags: ["tech", "react"],
        createdAt: now,
        updatedAt: now,
      };

      const opml = generateOpmlFile([feed], [techFolder, feFolder]);
      const parsed = parseOpmlFile(opml);
      expect(isOk(parsed)).toBe(true);
      const { entries } = unwrap(parsed);
      expect(entries).toHaveLength(1);
      const e = entries[0];
      expect(e.xmlUrl).toBe(feed.url);
      expect(e.htmlUrl).toBe(feed.siteUrl);
      expect(e.title).toBe(feed.title);
      expect(e.description).toBe(feed.description);
      expect(e.tags).toEqual(feed.tags);
      expect(e.createdAt).toBe(now);
      expect(e.folderPath).toEqual(["Tech", "Frontend"]);
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
      const { entries: parsed } = unwrap(parseResult);
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
