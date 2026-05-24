/**
 * Real-world OPML format smoke tests.
 *
 * Maps to CLAUDE.md's Tier 2.5 spirit: mocked tests prove logic, but
 * the formats produced by Feedly, NetNewsWire, and Inoreader in the
 * wild have idiosyncrasies our minimal happy-path fixtures don't
 * exercise. These fixtures are representative of what each reader
 * actually exports (cross-checked against their published examples
 * and user-reported exports). A green run here is the closest signal
 * to "this format won't surprise us in production" without actually
 * exporting from each reader.
 *
 * If a real export shape diverges from these fixtures, add the
 * divergent fixture here and treat the failure as a regression.
 */

import { describe, it, expect } from "vitest";
import { parseOpmlFile } from "../../src/core/opml/opml-service";
import { isOk, unwrap } from "@feedzero/core/utils/result";

/**
 * Feedly export: `opml version="1.0"` (not 2.0), both text and
 * title set on every outline, no per-outline `created`, no
 * dateCreated in head. Single level of folder nesting (Feedly's UI
 * is flat-folder; sub-folders weren't a thing on Feedly Classic).
 */
const FEEDLY_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>user@example.com subscriptions in feedly Cloud</title>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="TechCrunch" title="TechCrunch" xmlUrl="https://techcrunch.com/feed/" htmlUrl="https://techcrunch.com"/>
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com/"/>
    </outline>
    <outline text="News" title="News">
      <outline type="rss" text="BBC News" title="BBC News" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml" htmlUrl="https://www.bbc.com/news"/>
    </outline>
  </body>
</opml>`;

/**
 * NetNewsWire export: full OPML 2.0, head has dateCreated, per-outline
 * description is common, `version="RSS"` (not the spec's category value;
 * NetNewsWire writes this even though OPML 2.0 reserves type for the
 * format). Nested folders allowed.
 */
const NETNEWSWIRE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>NetNewsWire Subscriptions</title>
    <dateCreated>Sun, 12 May 2024 12:00:00 GMT</dateCreated>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Frontend" title="Frontend">
        <outline text="React Blog" title="React Blog" description="From the React team" type="rss" version="RSS" htmlUrl="https://reactjs.org" xmlUrl="https://reactjs.org/feed.xml"/>
      </outline>
      <outline text="Hacker News" title="Hacker News" description="Discussion of computing and entrepreneurship" type="rss" version="RSS" htmlUrl="https://news.ycombinator.com/" xmlUrl="https://news.ycombinator.com/rss"/>
    </outline>
  </body>
</opml>`;

/**
 * Inoreader export: `opml version="1.0"`, includes `category` on
 * outlines (Inoreader's tag system maps cleanly to OPML categories).
 * Some exports omit the per-outline `text` (just title).
 */
const INOREADER_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>Inoreader Feeds</title>
  </head>
  <body>
    <outline text="Tech" title="Tech">
      <outline title="Ars Technica" type="rss" category="tech,reviews" xmlUrl="https://feeds.arstechnica.com/arstechnica/index" htmlUrl="https://arstechnica.com"/>
      <outline title="The Verge" type="rss" category="tech,news" xmlUrl="https://www.theverge.com/rss/index.xml" htmlUrl="https://www.theverge.com"/>
    </outline>
  </body>
</opml>`;

/**
 * Reeder export: includes `created` per outline (Reeder timestamps
 * each subscription), uses both `text` and `title`, nested folders.
 * Demonstrates the provenance-preserving case.
 */
const REEDER_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Reeder Subscriptions</title>
    <dateCreated>2024-01-15T08:00:00Z</dateCreated>
    <ownerName>Reader User</ownerName>
  </head>
  <body>
    <outline text="News" title="News">
      <outline text="NYTimes" title="NYTimes" type="rss" xmlUrl="https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" htmlUrl="https://www.nytimes.com" created="Mon, 14 Mar 2018 10:00:00 GMT"/>
    </outline>
  </body>
</opml>`;

describe("real-world OPML format smoke", () => {
  describe("Feedly export", () => {
    it("parses opml v1.0 with flat folders and text+title outlines", () => {
      const result = parseOpmlFile(FEEDLY_OPML);
      expect(isOk(result)).toBe(true);
      const { entries, folders } = unwrap(result);
      expect(entries).toHaveLength(3);
      // Folder names preserved.
      expect(folders.map((f) => f.name)).toEqual(["Tech", "News"]);
      // Top-level Tech feeds get their folder path.
      const tc = entries.find((e) => e.title === "TechCrunch");
      expect(tc?.folderPath).toEqual(["Tech"]);
      const bbc = entries.find((e) => e.title === "BBC News");
      expect(bbc?.folderPath).toEqual(["News"]);
    });

    it("captures head.title for ImportResults attribution", () => {
      const result = parseOpmlFile(FEEDLY_OPML);
      expect(unwrap(result).head.title).toMatch(/feedly Cloud/);
    });
  });

  describe("NetNewsWire export", () => {
    it("parses opml v2.0 with nested folders + per-outline description", () => {
      const result = parseOpmlFile(NETNEWSWIRE_OPML);
      expect(isOk(result)).toBe(true);
      const { entries, folders } = unwrap(result);
      // React Blog is two levels deep — folderPath proves we preserve depth.
      const react = entries.find((e) => e.title === "React Blog");
      expect(react?.folderPath).toEqual(["Tech", "Frontend"]);
      expect(react?.description).toBe("From the React team");
      // HN sits one level deep alongside the Frontend subfolder.
      const hn = entries.find((e) => e.title === "Hacker News");
      expect(hn?.folderPath).toEqual(["Tech"]);
      expect(hn?.description).toMatch(/computing/);
      // Folders preamble: parents before children.
      expect(folders.map((f) => f.name)).toEqual(["Tech", "Frontend"]);
    });

    it("captures head.dateCreated for provenance display", () => {
      const result = parseOpmlFile(NETNEWSWIRE_OPML);
      expect(unwrap(result).head.dateCreated).toBeDefined();
    });

    it("does NOT treat NetNewsWire's version=\"RSS\" as a non-subscribable type", () => {
      // NetNewsWire writes `type="rss" version="RSS"`. Our filter is on
      // `type`, not `version` — so the feed must be subscribed.
      const result = parseOpmlFile(NETNEWSWIRE_OPML);
      const { entries } = unwrap(result);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe("Inoreader export", () => {
    it("parses categories into tags (comma-split, trimmed)", () => {
      const result = parseOpmlFile(INOREADER_OPML);
      expect(isOk(result)).toBe(true);
      const { entries } = unwrap(result);
      const ars = entries.find((e) => e.title === "Ars Technica");
      expect(ars?.tags).toEqual(["tech", "reviews"]);
      const verge = entries.find((e) => e.title === "The Verge");
      expect(verge?.tags).toEqual(["tech", "news"]);
    });

    it("tolerates outlines that omit text (only title is set)", () => {
      // Inoreader's exports occasionally omit text; title still resolves.
      const result = parseOpmlFile(INOREADER_OPML);
      const { entries } = unwrap(result);
      for (const e of entries) {
        expect(e.title).toBeTruthy();
      }
    });
  });

  describe("Reeder export", () => {
    it("parses outline.created into entry.createdAt for provenance", () => {
      const result = parseOpmlFile(REEDER_OPML);
      expect(isOk(result)).toBe(true);
      const { entries } = unwrap(result);
      const nyt = entries[0];
      expect(nyt.createdAt).toBe(Date.parse("Mon, 14 Mar 2018 10:00:00 GMT"));
    });

    it("captures head.ownerName for provenance attribution (display only)", () => {
      const result = parseOpmlFile(REEDER_OPML);
      expect(unwrap(result).head.ownerName).toBe("Reader User");
    });
  });
});
