import { describe, it, expect } from "vitest";
import {
  findFeedLinksInHtml,
  getWellKnownFeedUrls,
  findFeedLinksInAnchors,
} from "../../../src/core/discovery/strategies.js";

const PAGE_WITH_RSS_LINK = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_ATOM_LINK = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="alternate" type="application/atom+xml" title="Atom" href="/atom.xml">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_JSON_FEED_LINK = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="alternate" type="application/feed+json" title="JSON Feed" href="/feed.json">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_MULTIPLE_FEEDS = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
  <link rel="alternate" type="application/atom+xml" title="Atom" href="/atom.xml">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_RELATIVE_HREF = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="alternate" type="application/rss+xml" href="feed.xml">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITHOUT_FEED_LINKS = `<!DOCTYPE html>
<html><head>
  <title>Example Site</title>
  <link rel="stylesheet" href="/style.css">
</head><body><p>Hello</p></body></html>`;

const PAGE_WITH_FEED_ANCHORS = `<!DOCTYPE html>
<html><head><title>Example</title></head>
<body>
  <nav>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </nav>
  <footer>
    <a href="/feed.xml">RSS Feed</a>
    <a href="https://example.com/atom.xml">Atom</a>
    <a href="/privacy">Privacy</a>
  </footer>
</body></html>`;

const PAGE_WITH_NO_FEED_ANCHORS = `<!DOCTYPE html>
<html><head><title>Example</title></head>
<body>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</body></html>`;

describe("strategies", () => {
  describe("findFeedLinksInHtml", () => {
    it("should find RSS feed link", () => {
      const urls = findFeedLinksInHtml(PAGE_WITH_RSS_LINK, "https://example.com");
      expect(urls).toContain("https://example.com/feed.xml");
    });

    it("should find Atom feed link", () => {
      const urls = findFeedLinksInHtml(PAGE_WITH_ATOM_LINK, "https://example.com");
      expect(urls).toContain("https://example.com/atom.xml");
    });

    it("should find JSON Feed link", () => {
      const urls = findFeedLinksInHtml(PAGE_WITH_JSON_FEED_LINK, "https://example.com");
      expect(urls).toContain("https://example.com/feed.json");
    });

    it("should find multiple feed links", () => {
      const urls = findFeedLinksInHtml(PAGE_WITH_MULTIPLE_FEEDS, "https://example.com");
      expect(urls).toHaveLength(2);
      expect(urls).toContain("https://example.com/rss.xml");
      expect(urls).toContain("https://example.com/atom.xml");
    });

    it("should resolve relative hrefs against page URL", () => {
      const urls = findFeedLinksInHtml(
        PAGE_WITH_RELATIVE_HREF,
        "https://example.com/blog/",
      );
      expect(urls).toContain("https://example.com/blog/feed.xml");
    });

    it("should return empty array when no feed links exist", () => {
      const urls = findFeedLinksInHtml(PAGE_WITHOUT_FEED_LINKS, "https://example.com");
      expect(urls).toEqual([]);
    });

    it("should return empty array for empty HTML", () => {
      const urls = findFeedLinksInHtml("", "https://example.com");
      expect(urls).toEqual([]);
    });
  });

  describe("getWellKnownFeedUrls", () => {
    it("should return common feed paths for a given origin", () => {
      const urls = getWellKnownFeedUrls("https://example.com");
      expect(urls).toContain("https://example.com/feed");
      expect(urls).toContain("https://example.com/rss");
      expect(urls).toContain("https://example.com/atom.xml");
      expect(urls).toContain("https://example.com/feed.xml");
      expect(urls).toContain("https://example.com/rss.xml");
      expect(urls).toContain("https://example.com/index.xml");
    });

    it("should use the origin, stripping any path", () => {
      const urls = getWellKnownFeedUrls("https://example.com/blog/post");
      expect(urls[0]).toMatch(/^https:\/\/example\.com\//);
      // Should NOT include /blog/post in the paths
      expect(urls).not.toContain("https://example.com/blog/post/feed");
    });

    it("should include Ghost-style /rss/ path", () => {
      const urls = getWellKnownFeedUrls("https://example.com");
      expect(urls).toContain("https://example.com/rss/");
    });
  });

  describe("findFeedLinksInAnchors", () => {
    it("should find anchor tags with feed-like hrefs", () => {
      const urls = findFeedLinksInAnchors(
        PAGE_WITH_FEED_ANCHORS,
        "https://example.com",
      );
      expect(urls).toContain("https://example.com/feed.xml");
      expect(urls).toContain("https://example.com/atom.xml");
    });

    it("should not include non-feed anchors", () => {
      const urls = findFeedLinksInAnchors(
        PAGE_WITH_FEED_ANCHORS,
        "https://example.com",
      );
      expect(urls).not.toContain("https://example.com/about");
      expect(urls).not.toContain("https://example.com/privacy");
    });

    it("should return empty array when no feed-like anchors exist", () => {
      const urls = findFeedLinksInAnchors(
        PAGE_WITH_NO_FEED_ANCHORS,
        "https://example.com",
      );
      expect(urls).toEqual([]);
    });

    it("should return empty array for empty HTML", () => {
      const urls = findFeedLinksInAnchors("", "https://example.com");
      expect(urls).toEqual([]);
    });
  });
});
