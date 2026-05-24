import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
import { normalizeUrl } from "../../../src/core/feeds/feed-service.ts";

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
vi.mock("../../../src/core/storage/db.ts", () => {
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
    updateFeed: vi.fn(async (feed) => {
      feeds.set(feed.url, feed);
      return { ok: true, value: true };
    }),
    addArticles: vi.fn(async (arts) => {
      for (const a of arts) articles.set(a.id, a);
      return { ok: true, value: true };
    }),
    getArticleByGuid: vi.fn(async (feedId, guid) => {
      for (const a of articles.values()) {
        if (a.feedId === feedId && a.guid === guid) {
          return { ok: true, value: a };
        }
      }
      return { ok: true, value: null };
    }),
    updateArticle: vi.fn(async (article) => {
      articles.set(article.id, article);
      return { ok: true, value: true };
    }),
    updateArticles: vi.fn(async (arts) => {
      for (const a of arts) articles.set(a.id, a);
      return { ok: true, value: true };
    }),
    removeArticlesByFeedId: vi.fn(async (feedId) => {
      let removed = 0;
      for (const [id, a] of articles.entries()) {
        if (a.feedId === feedId) {
          articles.delete(id);
          removed++;
        }
      }
      return { ok: true, value: removed };
    }),
    dedupeArticles: vi.fn(async () => ({ ok: true, value: 0 })),
    _reset: () => {
      feeds.clear();
      orphanUrls.clear();
      articles.clear();
    },
    _addOrphan: (url) => orphanUrls.add(url),
    _feeds: feeds,
    _articles: articles,
  };
});

let addFeedFlow, addPlaceholderFeed, refreshFeed, refreshAllFeeds, reloadFeed, previewFeed;
let db;

beforeEach(async () => {
  db = await import("../../../src/core/storage/db.ts");
  db._reset();
  vi.clearAllMocks();

  // The refresh worker's host-pause map (Retry-After consumption) is a
  // process-level singleton — leak across tests would short-circuit
  // subsequent refresh calls before they reach the proxy mock.
  const { clearHostPauses } = await import(
    "../../../src/core/feeds/host-pause.ts"
  );
  clearHostPauses();

  // Reset module to clear any cached state
  const mod = await import("../../../src/core/feeds/feed-service.ts");
  addFeedFlow = mod.addFeedFlow;
  addPlaceholderFeed = mod.addPlaceholderFeed;
  refreshFeed = mod.refreshFeed;
  refreshAllFeeds = mod.refreshAllFeeds;
  reloadFeed = mod.reloadFeed;
  previewFeed = mod.previewFeed;
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

    it("flags HTTP fetch failures with reason: 'fetch-failure' (import-side recovery)", async () => {
      // Recoverable failures (429/503/5xx/4xx) are distinguished from
      // permanent failures (parse / discovery / duplicate) via a `reason`
      // discriminator so bulk import can create a placeholder feed and let
      // the user retry via refresh. Mirrors the existing
      // `reason: "free-quota-exceeded"` pattern.
      for (const status of [429, 503, 500, 404]) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          headers: new Headers(),
        });
        const result = await addFeedFlow(`https://example.com/${status}`);
        expect(isErr(result)).toBe(true);
        expect(result.reason).toBe("fetch-failure");
      }
    });

    it("flags network/transport errors with reason: 'fetch-failure'", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      const result = await addFeedFlow("https://example.com/network-err");
      expect(isErr(result)).toBe(true);
      expect(result.reason).toBe("fetch-failure");
    });

    it("does NOT flag parse / discovery failures as fetch-failure", async () => {
      // The URL isn't a feed and never will be. No point creating a
      // placeholder row that refresh can't recover.
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
      });
      const result = await addFeedFlow("https://example.com/not-a-feed");
      expect(isErr(result)).toBe(true);
      expect(result.reason).toBeUndefined();
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
      // Should be a clear, actionable message (either parse or discovery error)
      expect(result.error).toMatch(/not a valid feed|no rss feed could be found/i);
    });

    it("should return user-friendly error for unrecognized XML format", async () => {
      const xml = `<?xml version="1.0"?><html><body>Not a feed</body></html>`;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xml),
      });

      const result = await addFeedFlow("https://example.com/page");
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/not a valid feed|no rss feed could be found/i);
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

    it("should discover feed when user enters a website URL", async () => {
      const pageHtml = `<!DOCTYPE html>
<html><head>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><p>A website</p></body></html>`;

      globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
        const targetUrl = JSON.parse(opts?.body ?? "{}").url ?? "";
        // First call: try as feed — fails (it's a website)
        if (endpoint === "/api/feed" && !targetUrl.includes("feed.xml")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(pageHtml),
          });
        }
        // Discovery: fetch the discovered feed URL
        if (endpoint === "/api/feed" && targetUrl.includes("feed.xml")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(ATOM_XML),
          });
        }
        // Page fetch for discovery
        if (endpoint === "/api/page") {
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

    // Issue #117 (2026-05-23): an OPML outline with `title="CNBC"` was being
    // overridden by the feed body's <title> ("International: Top News And
    // Analysis"). The fix: the importer threads the outline's title into
    // addFeedFlow as an override that wins over the parsed feed's title.
    // The user picked the OPML title — respect it.
    it("uses options.titleOverride instead of the parsed feed's <title>", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      const result = await addFeedFlow("https://example.com/feed.xml", {
        titleOverride: "CNBC",
      });
      expect(isOk(result)).toBe(true);
      const { feed } = unwrap(result);
      // Parsed feed says "Example Feed"; OPML override wins.
      expect(feed.title).toBe("CNBC");
    });

    it("ignores empty / whitespace-only titleOverride and uses the parsed title", async () => {
      // An OPML outline with no `title` attr and no `text` attr produces
      // an empty extracted title. Empty must fall through to the parsed
      // feed's <title> rather than overwriting it with "".
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });

      const result = await addFeedFlow("https://example.com/feed.xml", {
        titleOverride: "   ",
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).feed.title).toBe("Example Feed");
    });

    // Part 2: addFeedFlow accepts the full OPML metadata bag. Each
    // field is independently testable.

    it("uses options.createdAtOverride for Feed.createdAt (provenance)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      const opmlCreated = Date.parse("2014-08-15T09:00:00Z");
      const result = await addFeedFlow("https://example.com/feed.xml", {
        createdAtOverride: opmlCreated,
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).feed.createdAt).toBe(opmlCreated);
    });

    it("falls back to Date.now() when createdAtOverride is invalid (NaN / 0 / negative)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      const before = Date.now();
      const result = await addFeedFlow("https://example.com/feed.xml", {
        createdAtOverride: NaN,
      });
      const after = Date.now();
      expect(isOk(result)).toBe(true);
      const ts = unwrap(result).feed.createdAt;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("uses options.descriptionFallback ONLY when the parsed feed has no description", async () => {
      // ATOM_XML has subtitle "A test feed" — not empty.
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      const result = await addFeedFlow("https://example.com/feed.xml", {
        descriptionFallback: "From OPML",
      });
      expect(isOk(result)).toBe(true);
      // Parsed description wins because it's non-empty.
      expect(unwrap(result).feed.description).toBe("A test feed");
    });

    it("uses descriptionFallback when parsed feed description is empty", async () => {
      const noDescAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>P</title>
    <link href="https://example.com/p" rel="alternate"/>
    <id>id-p</id>
    <published>2024-01-15T12:00:00Z</published>
    <content type="html">&lt;p&gt;c&lt;/p&gt;</content>
  </entry>
</feed>`;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(noDescAtom),
      });
      const result = await addFeedFlow("https://example.com/feed.xml", {
        descriptionFallback: "From OPML",
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).feed.description).toBe("From OPML");
    });

    it("threads options.tags into Feed.tags", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      const result = await addFeedFlow("https://example.com/feed.xml", {
        tags: ["tech", "frontend"],
      });
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).feed.tags).toEqual(["tech", "frontend"]);
    });

    it("omits Feed.tags when no tags are supplied", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      const result = await addFeedFlow("https://example.com/feed.xml");
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).feed.tags).toBeUndefined();
    });
  });

  describe("addPlaceholderFeed", () => {
    it("persists a placeholder feed with lastError and a URL-derived title", async () => {
      // Import scenario: a URL fetched fine in OPML but the upstream returned
      // 429. We persist it anyway so the user can hit `r` later to retry.
      const result = await addPlaceholderFeed(
        "https://news.example.com/feed.xml",
        "The feed at this URL could not be reached (HTTP 429, retry after 60s)",
      );

      expect(isOk(result)).toBe(true);
      const feed = unwrap(result);
      expect(feed.url).toBe("https://news.example.com/feed.xml");
      // Title is derived from the URL host, not "Untitled" — gives the user
      // a recognizable sidebar label until refresh backfills the real one.
      expect(feed.title).toBe("news.example.com");
      expect(feed.lastError).toMatch(/HTTP 429/);
      expect(feed.lastSuccessfulFetchAt).toBeUndefined();
      expect(db.addFeed).toHaveBeenCalledOnce();
    });

    it("normalizes the URL the same way addFeedFlow does", async () => {
      const result = await addPlaceholderFeed(
        "HTTPS://Example.COM/feed/",
        "boom",
      );
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).url).toBe("https://example.com/feed");
    });

    it("returns err when the URL already exists as a real feed", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      await addFeedFlow("https://example.com/feed.xml");

      const result = await addPlaceholderFeed(
        "https://example.com/feed.xml",
        "boom",
      );
      expect(isErr(result)).toBe(true);
      expect(result.error).toMatch(/already exists/i);
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

// --- Refresh tests ---

const ATOM_WITH_TWO = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Test Post</title>
    <link href="https://example.com/post/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <content type="html">&lt;p&gt;Content&lt;/p&gt;</content>
  </entry>
  <entry>
    <title>New Post</title>
    <link href="https://example.com/post/2" rel="alternate"/>
    <id>tag:example.com,2024:2</id>
    <published>2024-01-16T12:00:00Z</published>
    <content type="html">&lt;p&gt;New content&lt;/p&gt;</content>
  </entry>
</feed>`;

const ATOM_UPDATED_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Test Post</title>
    <link href="https://example.com/post/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <content type="html">&lt;p&gt;Updated content with corrections&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("refreshFeed", () => {
  async function addTestFeed() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });
    const result = await addFeedFlow("https://example.com/feed.xml");
    return unwrap(result).feed;
  }

  it("should add new articles that are not in the database", async () => {
    const feed = await addTestFeed();

    // Now refresh with a feed that has 2 articles (1 existing + 1 new)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_WITH_TWO),
    });

    const result = await refreshFeed(feed);
    expect(isOk(result)).toBe(true);
    expect(result.value.newCount).toBe(1);
    expect(result.value.updatedCount).toBe(0);

    // Verify new article was stored
    expect(db.addArticles).toHaveBeenCalledTimes(2); // once for add, once for refresh
  });

  it("self-heals by deduping the feed's articles after a successful refresh", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });

    await refreshFeed(feed);

    expect(db.dedupeArticles).toHaveBeenCalledWith(feed.id);
  });

  it("should not create duplicates when refreshing with same articles", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });

    const result = await refreshFeed(feed);
    expect(isOk(result)).toBe(true);
    expect(result.value.newCount).toBe(0);
    expect(result.value.updatedCount).toBe(0);
  });

  it("should update articles when content changes", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_UPDATED_CONTENT),
    });

    const result = await refreshFeed(feed);
    expect(isOk(result)).toBe(true);
    expect(result.value.newCount).toBe(0);
    expect(result.value.updatedCount).toBe(1);
    expect(db.updateArticles).toHaveBeenCalledOnce();
  });

  it("should return error when fetch fails", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/Failed to fetch/);
  });

  it("surfaces Retry-After when the upstream returns 429", async () => {
    // Self-host scenario from feedback #97: a feed hit by upstream
    // rate-limiting should tell the user when to retry, not a generic
    // "Failed to fetch feed (HTTP 429)". The refresh worker doesn't
    // know how to retry automatically yet (separate piece of work),
    // but the error message must surface the upstream's hint.
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map([["retry-after", "120"]]),
    });

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/rate.?limit|429/i);
    expect(result.error).toMatch(/120s|2 ?min/i);
  });

  it("falls back to a plain 429 message when no Retry-After is present", async () => {
    const feed = await addTestFeed();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map(),
    });
    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/rate.?limit|429/i);
  });

  it("should return 'Refresh failed: ...' when fetch throws (outer catch)", async () => {
    const feed = await addTestFeed();

    // Network throw, not just non-OK — hits the outer catch
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connection reset"));

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/Refresh failed/);
    expect(result.error).toMatch(/connection reset/);
  });

  it("surfaces upstream Retry-After seconds when the server returns 429", async () => {
    // The proxy propagates Retry-After verbatim for 429/503. Surfacing it
    // in the error message lets the UI tell the user "this feed asked us
    // to back off for N seconds" rather than the bare HTTP code.
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "60" }),
    });

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/429/);
    expect(result.error).toMatch(/retry after 60s/i);
  });

  it("surfaces upstream Retry-After seconds when the server returns 503", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ "Retry-After": "30" }),
    });

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/503/);
    expect(result.error).toMatch(/retry after 30s/i);
  });

  it("falls back to bare HTTP status when Retry-After is absent", async () => {
    const feed = await addTestFeed();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    const result = await refreshFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/429/);
    expect(result.error).not.toMatch(/retry after/i);
  });

  describe("freshness timestamps", () => {
    // Stale-feed UI: every refresh must persist when we last reached the
    // publisher so the sidebar can show a stale indicator after N days of
    // silent failure. Two timestamps because they answer different questions:
    //   lastFetchedAt          → "did we even try recently?"
    //   lastSuccessfulFetchAt  → "did the publisher actually respond?"
    it("records both lastFetchedAt and lastSuccessfulFetchAt on success", async () => {
      const before = Date.now();
      const feed = await addTestFeed();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      await refreshFeed(feed);

      expect(db.updateFeed).toHaveBeenCalled();
      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastFetchedAt).toBeGreaterThanOrEqual(before);
      expect(lastCall.lastSuccessfulFetchAt).toBeGreaterThanOrEqual(before);
    });

    it("records only lastFetchedAt on HTTP failure (publisher unreachable)", async () => {
      const feed = await addTestFeed();
      const baselineSuccess = feed.lastSuccessfulFetchAt;
      const before = Date.now();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
      });
      await refreshFeed(feed);

      expect(db.updateFeed).toHaveBeenCalled();
      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastFetchedAt).toBeGreaterThanOrEqual(before);
      expect(lastCall.lastSuccessfulFetchAt).toBe(baselineSuccess);
    });

    it("preserves prior lastSuccessfulFetchAt when fetch throws (network error)", async () => {
      const feed = await addTestFeed();
      const baselineSuccess = feed.lastSuccessfulFetchAt;
      const before = Date.now();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection reset"));
      await refreshFeed(feed);

      expect(db.updateFeed).toHaveBeenCalled();
      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastFetchedAt).toBeGreaterThanOrEqual(before);
      expect(lastCall.lastSuccessfulFetchAt).toBe(baselineSuccess);
    });

    it("preserves a prior lastSuccessfulFetchAt across a failing refresh", async () => {
      // Feed has been successfully fetched in the past; a transient failure
      // must not clobber that history — the stale-indicator threshold counts
      // from the prior success.
      const feed = await addTestFeed();
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      feed.lastSuccessfulFetchAt = yesterday;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
      });
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastSuccessfulFetchAt).toBe(yesterday);
    });
  });

  describe("lastError lifecycle", () => {
    // The sidebar surfaces broken feeds via Feed.lastError. Same chokepoint
    // (`persistFreshness`) that owns the freshness timestamps owns this
    // field so the in-memory feed and the DB row never disagree.
    it("sets lastError on HTTP failure", async () => {
      const feed = await addTestFeed();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
      });
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastError).toMatch(/503/);
    });

    it("sets lastError on network/transport error", async () => {
      const feed = await addTestFeed();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastError).toMatch(/ECONNRESET/);
    });

    it("clears lastError on successful refresh", async () => {
      const feed = await addTestFeed();
      // Pretend a prior refresh failed.
      feed.lastError = "previous failure";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.lastError).toBeUndefined();
    });
  });

  describe("first-success metadata backfill", () => {
    // A placeholder feed (added by import after a fetch failure) starts with
    // a URL-derived title and empty description/siteUrl. The first
    // successful refresh upgrades it to a real feed — we overwrite metadata
    // ONLY when this is the first-ever success, so a user's rename of an
    // established feed is never clobbered.
    it("backfills title/description/siteUrl when lastSuccessfulFetchAt is undefined", async () => {
      const placeholderResult = await addPlaceholderFeed(
        "https://example.com/feed.xml",
        "transient 429",
      );
      const feed = unwrap(placeholderResult);
      expect(feed.lastSuccessfulFetchAt).toBeUndefined();
      expect(feed.title).toBe("example.com");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.title).toBe("Example Feed");
      expect(lastCall.description).toBe("A test feed");
      expect(lastCall.siteUrl).toBe("https://example.com");
      expect(lastCall.lastError).toBeUndefined();
    });

    it("does NOT overwrite title on subsequent successful refresh (user may have renamed it)", async () => {
      const feed = await addTestFeed();
      // Simulate a user rename.
      feed.title = "My Favorite Feed";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(ATOM_XML),
      });
      await refreshFeed(feed);

      const lastCall = db.updateFeed.mock.calls.at(-1)[0];
      expect(lastCall.title).toBe("My Favorite Feed");
    });
  });
});

describe("refreshAllFeeds", () => {
  it("should refresh all stored feeds and return results", async () => {
    // Add a feed first
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });
    await addFeedFlow("https://example.com/feed.xml");

    // Now refresh — same content, so 0 new
    const result = await refreshAllFeeds();
    expect(isOk(result)).toBe(true);
    expect(result.value.results.length).toBe(1);
    expect(result.value.results[0].newCount).toBe(0);
  });

  it("should return empty results when no feeds exist", async () => {
    const result = await refreshAllFeeds();
    expect(isOk(result)).toBe(true);
    expect(result.value.results.length).toBe(0);
  });

  it("refreshes cross-host feeds in parallel but serializes same-host feeds", async () => {
    // Three feeds on THREE DIFFERENT hosts — the per-host serialization
    // added for feedback #97 (avoid bursting one upstream and tripping
    // rate limits) shouldn't slow down unrelated upstreams. They must
    // still all fire before any resolves.
    const hosts = ["a.example.com", "b.example.com", "c.example.com"];
    for (let i = 0; i < 3; i++) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            ATOM_XML.replace("Example Feed", `Feed ${i + 1}`).replace(
              "tag:example.com,2024:1",
              `tag:example.com,2024:${i + 1}`,
            ),
          ),
      });
      await addFeedFlow(`https://${hosts[i]}/feed.xml`);
    }

    const callOrder = [];
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callOrder.push("start");
      return Promise.resolve({
        ok: true,
        text: () => {
          callOrder.push("resolve");
          return Promise.resolve(ATOM_XML);
        },
      });
    });

    const result = await refreshAllFeeds();
    expect(isOk(result)).toBe(true);
    expect(result.value.results.length).toBe(3);

    const firstResolveIndex = callOrder.indexOf("resolve");
    const startCount = callOrder
      .slice(0, firstResolveIndex)
      .filter((e) => e === "start").length;
    expect(startCount).toBe(3);
  });

  it("serializes refreshes of same-host feeds (per-host politeness)", async () => {
    // Three feeds on ONE host — must NOT all fire concurrently. The
    // group-by-host packing splits them across batches; only one start
    // happens before the first resolve. Lock the politeness contract
    // so a future refactor can't silently regress to all-concurrent.
    for (let i = 1; i <= 3; i++) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            ATOM_XML.replace("Example Feed", `Feed ${i}`).replace(
              "tag:example.com,2024:1",
              `tag:example.com,2024:${i}`,
            ),
          ),
      });
      await addFeedFlow(`https://feeds.feedburner.com/feed${i}`);
    }

    const callOrder = [];
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callOrder.push("start");
      return Promise.resolve({
        ok: true,
        text: () => {
          callOrder.push("resolve");
          return Promise.resolve(ATOM_XML);
        },
      });
    });

    const result = await refreshAllFeeds();
    expect(isOk(result)).toBe(true);
    expect(result.value.results.length).toBe(3);

    const firstResolveIndex = callOrder.indexOf("resolve");
    const startCount = callOrder
      .slice(0, firstResolveIndex)
      .filter((e) => e === "start").length;
    expect(startCount).toBe(1);
  });

  it("records per-feed errors when refresh fails for that feed", async () => {
    // Add a feed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });
    await addFeedFlow("https://example.com/feed.xml");

    // Now make subsequent fetches fail
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await refreshAllFeeds();
    expect(isOk(result)).toBe(true);
    expect(result.value.results).toHaveLength(1);
    expect(result.value.results[0].error).toMatch(/Failed to fetch/);
    expect(result.value.results[0].newCount).toBe(0);
    expect(result.value.results[0].updatedCount).toBe(0);
  });
});

// --- previewFeed tests ---

describe("previewFeed", () => {
  it("returns feed title, siteUrl, and articles without persisting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });

    const result = await previewFeed("https://example.com/feed.xml");
    expect(isOk(result)).toBe(true);
    const preview = unwrap(result);
    expect(preview.title).toBe("Example Feed");
    expect(preview.siteUrl).toBe("https://example.com");
    expect(preview.articles.length).toBeGreaterThan(0);
    // Did not persist
    expect(db.addFeed).not.toHaveBeenCalled();
    expect(db.addArticles).not.toHaveBeenCalled();
  });

  it("synthesises summary from content when summary is missing", async () => {
    // Use a feed where article has content but no summary
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>X</title>
  <link href="https://x.com" rel="alternate"/>
  <entry>
    <title>P</title>
    <link href="https://x.com/1" rel="alternate"/>
    <id>tag:x.com,2024:1</id>
    <content type="html">&lt;p&gt;Some content body that is plain enough for summary fallback.&lt;/p&gt;</content>
  </entry>
</feed>`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(feed),
    });

    const result = await previewFeed("https://x.com/feed.xml");
    expect(isOk(result)).toBe(true);
    const preview = unwrap(result);
    expect(preview.articles[0].summary).toContain("Some content body");
  });

  it("returns user-friendly error when fetch responds non-OK", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await previewFeed("https://missing.example/feed");
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/could not be reached/i);
  });

  it("returns user-friendly error when fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("network down"));
    const result = await previewFeed("https://x.example/feed");
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/could not be reached/i);
  });

  it("returns user-friendly error when content is not a feed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
    });
    const result = await previewFeed("https://x.example/page");
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/not a valid feed/i);
  });
});

// --- reloadFeed tests ---

describe("reloadFeed", () => {
  async function addTestFeedForReload() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_XML),
    });
    return unwrap(
      await addFeedFlow("https://example.com/feed.xml"),
    ).feed;
  }

  it("removes existing articles, fetches, parses, and stores fresh", async () => {
    const feed = await addTestFeedForReload();

    // Confirm we start with 1 stored article
    expect(db._articles.size).toBe(1);

    // Reload with a different feed payload (2 articles)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(ATOM_WITH_TWO),
    });

    const result = await reloadFeed(feed);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).articleCount).toBe(2);

    expect(db.removeArticlesByFeedId).toHaveBeenCalledWith(feed.id);
    expect(db.addArticles).toHaveBeenCalled();
    // Old article gone, two new ones present
    expect(db._articles.size).toBe(2);
  });

  it("uses prefetchedContent when provided (no network call)", async () => {
    const feed = await addTestFeedForReload();

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await reloadFeed(feed, { prefetchedContent: ATOM_WITH_TWO });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).articleCount).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns error when fetch responds non-OK", async () => {
    const feed = await addTestFeedForReload();

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await reloadFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/Failed to fetch/);
  });

  it("returns error when parse fails", async () => {
    const feed = await addTestFeedForReload();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>Not a feed</html>"),
    });

    const result = await reloadFeed(feed);
    expect(isErr(result)).toBe(true);
  });

  it("returns error when fetch throws (network)", async () => {
    const feed = await addTestFeedForReload();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("dns fail"));

    const result = await reloadFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/Reload failed/);
  });

  it("propagates removeArticlesByFeedId failure", async () => {
    const feed = await addTestFeedForReload();

    db.removeArticlesByFeedId.mockResolvedValueOnce({
      ok: false,
      error: "DB write blocked",
    });

    const result = await reloadFeed(feed);
    expect(isErr(result)).toBe(true);
    expect(result.error).toMatch(/DB write blocked/);
  });

  it("succeeds with zero articles when feed payload has no items", async () => {
    const feed = await addTestFeedForReload();

    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Empty</title>
  <link href="https://example.com" rel="alternate"/>
</feed>`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(emptyFeed),
    });

    const result = await reloadFeed(feed);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).articleCount).toBe(0);
  });

  it("skips articles with no guid and no link during reload", async () => {
    const feed = await addTestFeedForReload();

    // Atom without <id> and without <link> for the entry — both guid sources
    // are empty, so the entry is skipped.
    const noIds = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>No IDs</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Orphan</title>
    <summary>No id, no link</summary>
  </entry>
  <entry>
    <title>Has Id</title>
    <link href="https://example.com/2" rel="alternate"/>
    <id>tag:example.com,2024:2</id>
    <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
  </entry>
</feed>`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(noIds),
    });

    const result = await reloadFeed(feed);
    expect(isOk(result)).toBe(true);
    // Only the entry with an id was kept
    expect(unwrap(result).articleCount).toBe(1);
  });
});
