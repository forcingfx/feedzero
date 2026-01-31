import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "../../../src/utils/result.js";

// We'll test feed-service by mocking fetch and the db/parser modules
const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <subtitle>A test feed</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Test Post</title>
    <link href="https://example.com/post/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <content type="html">&lt;p&gt;Content&lt;/p&gt;</content>
    <author><name>Alice</name></author>
  </entry>
</feed>`;

const JSON_FEED_STR = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Example JSON Feed",
  home_page_url: "https://example.com",
  description: "A test JSON feed",
  items: [
    {
      id: "https://example.com/post/1",
      url: "https://example.com/post/1",
      title: "Test JSON Post",
      content_html: "<p>Content</p>",
      date_published: "2024-01-15T12:00:00Z",
      authors: [{ name: "Alice" }],
    },
  ],
});

// Mock db module
vi.mock("../../../src/core/storage/db.js", () => {
  const feeds = new Map();
  const articles = new Map();
  return {
    addFeed: vi.fn(async (feed) => {
      if (feeds.has(feed.url)) {
        return { ok: false, error: "Duplicate feed URL" };
      }
      feeds.set(feed.url, feed);
      return { ok: true, value: true };
    }),
    getFeeds: vi.fn(async () => ({
      ok: true,
      value: [...feeds.values()],
    })),
    addArticles: vi.fn(async (arts) => {
      for (const a of arts) articles.set(a.id, a);
      return { ok: true, value: true };
    }),
    _reset: () => {
      feeds.clear();
      articles.clear();
    },
    _feeds: feeds,
  };
});

let addFeedFlow;
let db;

beforeEach(async () => {
  db = await import("../../../src/core/storage/db.js");
  db._reset();
  vi.clearAllMocks();

  // Reset module to clear any cached state
  const mod = await import("../../../src/core/feeds/feed-service.js");
  addFeedFlow = mod.addFeedFlow;
});

describe("feed-service", () => {
  describe("addFeedFlow", () => {
    it("should fetch, parse, and store an Atom feed", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      const result = await addFeedFlow("https://example.com/feed.xml");
      expect(isOk(result)).toBe(true);

      const { feed, articles } = unwrap(result);
      expect(feed.title).toBe("Example Feed");
      expect(articles.length).toBeGreaterThan(0);
      expect(db.addFeed).toHaveBeenCalledOnce();
      expect(db.addArticles).toHaveBeenCalledOnce();
    });

    it("should fetch, parse, and store a JSON Feed", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON_FEED_STR),
      });

      const result = await addFeedFlow("https://example.com/feed.json");
      expect(isOk(result)).toBe(true);

      const { feed, articles } = unwrap(result);
      expect(feed.title).toBe("Example JSON Feed");
      expect(articles[0].title).toBe("Test JSON Post");
    });

    it("should return error for duplicate feed URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      // Add once
      await addFeedFlow("https://example.com/feed.xml");

      // Add again — should fail with duplicate message
      const result = await addFeedFlow("https://example.com/feed.xml");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/already exists/i);
    });

    it("should return error when fetch fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await addFeedFlow("https://example.com/feed");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/could not be reached/i);
    });

    it("should return error when fetch throws (network error)", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await addFeedFlow("https://example.com/feed");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/could not be reached/i);
    });

    it("should return error for non-feed content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
      });

      const result = await addFeedFlow("https://example.com/page");
      expect(isErr(result)).toBe(true);
    });

    it("should return user-friendly error for HTML pages (not raw XML errors)", async () => {
      // Simulates fetching a website like https://daringfireball.net
      // which returns HTML, not a feed
      const html = `<!DOCTYPE html><html><head><title>Example</title><link rel="stylesheet" href="/style.css"></head><body><p>Hello</p></body></html>`;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      });

      const result = await addFeedFlow("https://example.com");
      expect(isErr(result)).toBe(true);
      // Should NOT contain raw XML parser internals
      expect(result.error).not.toMatch(/parsererror/i);
      expect(result.error).not.toMatch(/Invalid XML/);
      expect(result.error).not.toMatch(/mismatched tag/i);
      // Should be a clear, actionable message
      expect(result.error).toMatch(/not a valid feed/i);
    });

    it("should return user-friendly error for unrecognized XML format", async () => {
      const xml = `<?xml version="1.0"?><html><body>Not a feed</body></html>`;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const result = await addFeedFlow("https://example.com/page");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/not a valid feed/i);
      expect(result.error).not.toMatch(/Unrecognized feed format/);
    });

    it("should return user-friendly error for fetch failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await addFeedFlow("https://example.com/missing");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/could not be reached/i);
    });

    it("should return user-friendly error for network failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const result = await addFeedFlow("https://example.com/feed");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/could not be reached/i);
    });
  });
});
