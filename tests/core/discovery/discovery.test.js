import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "../../../src/utils/result.js";

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
  const mod = await import("../../../src/core/discovery/discovery.js");
  discoverFeed = mod.discoverFeed;
});

describe("discoverFeed", () => {
  it("should discover feed via HTML link autodiscovery", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/page")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_FEED_LINK),
        });
      }
      if (url.includes("/api/feed")) {
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

  it("should discover feed via well-known path when no HTML link exists", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/page")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_NO_FEED),
        });
      }
      // Only /feed path returns valid feed
      if (url.includes("/api/feed") && url.includes(encodeURIComponent("/feed"))) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      if (url.includes("/api/feed")) {
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
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/page")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_FEED_ANCHOR),
        });
      }
      // Only /rss.xml returns valid feed
      if (url.includes("/api/feed") && url.includes(encodeURIComponent("/rss.xml"))) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        });
      }
      if (url.includes("/api/feed")) {
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
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/page")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(PAGE_WITH_NO_FEED),
        });
      }
      if (url.includes("/api/feed")) {
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
});
