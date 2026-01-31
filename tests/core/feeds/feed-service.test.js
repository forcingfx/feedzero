import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "../../../src/utils/result.js";
import { normalizeUrl } from "../../../src/core/feeds/feed-service.js";

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

// Feed where articles only have summaries, no full content
const SUMMARY_ONLY_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Summary Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Summary Post</title>
    <link href="https://example.com/post/99" rel="alternate"/>
    <id>tag:example.com,2024:99</id>
    <published>2024-01-15T12:00:00Z</published>
    <summary>A short teaser.</summary>
    <author><name>Bob</name></author>
  </entry>
</feed>`;

const EXTRACTED_PAGE_HTML = `<!DOCTYPE html>
<html><head><title>Summary Post</title></head>
<body>
  <nav>Nav</nav>
  <article>
    <h1>Summary Post</h1>
    <p>This is the full article content that was extracted from the page.</p>
    <p>It has multiple paragraphs to ensure it is substantial enough.</p>
    <p>The extraction process pulled this from the linked URL.</p>
  </article>
  <footer>Footer</footer>
</body></html>`;

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
  // URLs that exist in the index but can't be decrypted (orphans)
  const orphanUrls = new Set();
  const articles = new Map();
  return {
    feedExistsByUrl: vi.fn(async (url) => ({
      ok: true,
      value: feeds.has(url) || orphanUrls.has(url),
    })),
    getFeeds: vi.fn(async () => ({
      ok: true,
      // Orphans are NOT returned by getFeeds (decryption fails)
      value: [...feeds.values()],
    })),
    removeFeedsByUrl: vi.fn(async (url) => {
      orphanUrls.delete(url);
      return { ok: true, value: true };
    }),
    addFeed: vi.fn(async (feed) => {
      if (feeds.has(feed.url)) {
        return { ok: false, error: "A feed with this URL already exists" };
      }
      orphanUrls.delete(feed.url);
      feeds.set(feed.url, feed);
      return { ok: true, value: true };
    }),
    addArticles: vi.fn(async (arts) => {
      for (const a of arts) articles.set(a.id, a);
      return { ok: true, value: true };
    }),
    _reset: () => {
      feeds.clear();
      orphanUrls.clear();
      articles.clear();
    },
    _addOrphan: (url) => orphanUrls.add(url),
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

    it("should replace orphaned feed record and succeed", async () => {
      // Simulate an orphan: URL exists in index but can't be decrypted
      db._addOrphan("https://example.com/feed.xml");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      const result = await addFeedFlow("https://example.com/feed.xml");
      expect(isOk(result)).toBe(true);

      const { feed } = unwrap(result);
      expect(feed.title).toBe("Example Feed");
      expect(db.removeFeedsByUrl).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
      );
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

    it("should detect duplicate when trailing slash differs", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      await addFeedFlow("https://example.com/feed");
      const result = await addFeedFlow("https://example.com/feed/");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/already exists/i);
    });

    it("should detect duplicate when scheme case differs", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      await addFeedFlow("https://example.com/feed");
      const result = await addFeedFlow("HTTPS://Example.COM/feed");
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

    it("should extract full text for summary-only articles", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/api/feed")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(SUMMARY_ONLY_ATOM),
          });
        }
        if (url.includes("/api/page")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(EXTRACTED_PAGE_HTML),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await addFeedFlow("https://example.com/summary-feed");
      expect(isOk(result)).toBe(true);

      const { articles } = unwrap(result);
      expect(articles.length).toBe(1);
      // Content should be populated from extraction, not just the short summary
      expect(articles[0].content).toBeTruthy();
      expect(articles[0].content.length).toBeGreaterThan(50);
    });

    it("should not extract for articles that already have full content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      const result = await addFeedFlow("https://example.com/full-feed");
      expect(isOk(result)).toBe(true);

      // fetch should only be called once (for the feed), not for article pages
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should gracefully handle extraction failure and keep original content", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/api/feed")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(SUMMARY_ONLY_ATOM),
          });
        }
        if (url.includes("/api/page")) {
          // Page fetch fails
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await addFeedFlow("https://example.com/summary-feed");
      expect(isOk(result)).toBe(true);

      // Should still succeed — extraction failure is non-fatal
      const { articles } = unwrap(result);
      expect(articles.length).toBe(1);
    });

    it("should discover feed when user enters a website URL", async () => {
      const pageHtml = `<!DOCTYPE html>
<html><head>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><p>A website</p></body></html>`;

      globalThis.fetch = vi.fn().mockImplementation((url) => {
        // First call: try as feed — fails (it's a website)
        if (url.includes("/api/feed") && !url.includes("feed.xml")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(pageHtml),
          });
        }
        // Discovery: fetch the discovered feed URL
        if (url.includes("/api/feed") && url.includes("feed.xml")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(ATOM_XML),
          });
        }
        // Page fetch for discovery
        if (url.includes("/api/page")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(pageHtml),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await addFeedFlow("https://example.com");
      expect(isOk(result)).toBe(true);

      const { feed } = unwrap(result);
      expect(feed.title).toBe("Example Feed");
    });
  });
});

describe("normalizeUrl", () => {
  it("should add https:// to bare domains", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
  });

  it("should add https:// to domains with path", () => {
    expect(normalizeUrl("example.com/rss")).toBe("https://example.com/rss");
  });

  it("should add https:// to www domains", () => {
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
  });

  it("should preserve existing https scheme", () => {
    expect(normalizeUrl("https://example.com/feed")).toBe(
      "https://example.com/feed",
    );
  });

  it("should preserve existing http scheme", () => {
    expect(normalizeUrl("http://example.com/feed")).toBe(
      "http://example.com/feed",
    );
  });
});
