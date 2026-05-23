import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
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

const PAGE_WITH_FEED_LINK = `<!DOCTYPE html>
<html><head>
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_NO_FEED = `<!DOCTYPE html>
<html><head><title>No Feed</title></head>
<body><p>No feed here</p></body></html>`;

const PAGE_WITH_FEED_ANCHOR = `<!DOCTYPE html>
<html><head><title>Site</title></head>
<body><footer><a href="/rss.xml">RSS</a></footer></body></html>`;

let discoverFeed;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../../src/core/discovery/discovery.ts");
  discoverFeed = mod.discoverFeed;
});

describe("discoverFeed", () => {
  /** Extract the target URL from a POST proxy call's body. */
  function targetUrlFrom(opts) {
    return JSON.parse(opts?.body ?? "{}").url ?? "";
  }

  it("should discover feed via HTML link autodiscovery", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
      if (endpoint === "/api/page") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_FEED_LINK),
        });
      }
      if (endpoint === "/api/feed") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://example.com");
    expect(isOk(result)).toBe(true);

    const { feedUrl, feed, articles } = unwrap(result);
    expect(feedUrl).toBe("https://example.com/feed.xml");
    expect(feed.title).toBe("Example Feed");
    expect(articles.length).toBeGreaterThan(0);
  });

  it("resolves a bridge URL as strategy 0 when bridges are enabled (no page fetch needed)", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
      if (
        endpoint === "/api/feed" &&
        targetUrlFrom(opts) === "https://www.reddit.com/r/selfhosted/.rss"
      ) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://www.reddit.com/r/selfhosted", {
      bridges: true,
    });

    expect(isOk(result)).toBe(true);
    expect(unwrap(result).feedUrl).toBe(
      "https://www.reddit.com/r/selfhosted/.rss",
    );
    const pageCalls = globalThis.fetch.mock.calls.filter(
      ([endpoint]) => endpoint === "/api/page",
    );
    expect(pageCalls).toHaveLength(0);
  });

  it("does NOT run bridges when the gate is off (defaults to page strategies)", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
      if (endpoint === "/api/page") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_NO_FEED),
        });
      }
      if (
        endpoint === "/api/feed" &&
        targetUrlFrom(opts) === "https://www.reddit.com/r/selfhosted/.rss"
      ) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://www.reddit.com/r/selfhosted");

    expect(isErr(result)).toBe(true);
    // The bridge's .rss candidate must never be requested when the gate is off.
    const triedBridgeUrl = globalThis.fetch.mock.calls.some(
      ([endpoint, opts]) =>
        endpoint === "/api/feed" &&
        targetUrlFrom(opts) === "https://www.reddit.com/r/selfhosted/.rss",
    );
    expect(triedBridgeUrl).toBe(false);
  });

  it("should discover feed via well-known path when no HTML link exists", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
      if (endpoint === "/api/page") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_NO_FEED),
        });
      }
      // Only /feed path returns valid feed
      if (endpoint === "/api/feed" && targetUrlFrom(opts).includes("/feed")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      if (endpoint === "/api/feed") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://example.com");
    expect(isOk(result)).toBe(true);

    const { feedUrl } = unwrap(result);
    expect(feedUrl).toContain("/feed");
  });

  it("should discover feed via anchor link scanning", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint, opts) => {
      if (endpoint === "/api/page") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_FEED_ANCHOR),
        });
      }
      // Only /rss.xml returns valid feed
      if (
        endpoint === "/api/feed" &&
        targetUrlFrom(opts).includes("/rss.xml")
      ) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      if (endpoint === "/api/feed") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://example.com");
    expect(isOk(result)).toBe(true);
  });

  it("should return error when no feed can be found", async () => {
    globalThis.fetch = vi.fn().mockImplementation((endpoint) => {
      if (endpoint === "/api/page") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_NO_FEED),
        });
      }
      if (endpoint === "/api/feed") {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<html><body>Not a feed</body></html>"),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await discoverFeed("https://example.com");
    expect(isErr(result)).toBe(true);
  });

  it("should return error when page fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await discoverFeed("https://example.com");
    expect(isErr(result)).toBe(true);
  });

  it("propagates a 429 status as a rate-limit-specific error message", async () => {
    // Self-host symptom from feedback #97: 14 feeds fail with "No RSS feed
    // could be found" when the real cause is upstream rate-limiting. The
    // discovery layer must surface the HTTP status so the user sees the
    // actual problem, not a misleading "no feed exists" diagnosis.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map([["retry-after", "60"]]),
      text: () => Promise.resolve(""),
    });

    const result = await discoverFeed("https://example.com");
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error).toMatch(/rate.?limit|429/i);
  });

  it("propagates a 403 status as a block-specific error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Map(),
      text: () => Promise.resolve(""),
    });

    const result = await discoverFeed("https://example.com");
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error).toMatch(/block|forbidden|403/i);
  });
});
