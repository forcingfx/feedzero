import { describe, it, expect } from "vitest";
import { feedCatalog, isSubscribed, findSubscribedFeed } from "@/lib/feed-catalog.ts";
import type { Feed } from "@/types/index.ts";

function makeFeed(url: string): Feed {
  return {
    id: "id-" + url,
    url,
    title: "Test",
    description: "",
    siteUrl: "https://example.com",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("feedCatalog", () => {
  it("is a non-empty array of categories", () => {
    expect(feedCatalog.length).toBeGreaterThan(0);
  });

  it("each category has required fields", () => {
    for (const category of feedCatalog) {
      expect(category.id).toBeTruthy();
      expect(category.name).toBeTruthy();
      expect(category.description).toBeTruthy();
      expect(category.feeds.length).toBeGreaterThan(0);
    }
  });

  it("each feed has required fields", () => {
    for (const category of feedCatalog) {
      for (const feed of category.feeds) {
        expect(feed.name).toBeTruthy();
        expect(feed.feedUrl).toMatch(/^https?:\/\//);
        expect(feed.siteUrl).toMatch(/^https?:\/\//);
        expect(feed.description).toBeTruthy();
        expect(Array.isArray(feed.tags)).toBe(true);
      }
    }
  });

  it("has no duplicate feed URLs across categories", () => {
    const allUrls = feedCatalog.flatMap((c) => c.feeds.map((f) => f.feedUrl));
    const uniqueUrls = new Set(allUrls);
    expect(uniqueUrls.size).toBe(allUrls.length);
  });

  it("has unique category IDs", () => {
    const ids = feedCatalog.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isSubscribed", () => {
  it("returns true when feed URL matches a subscribed feed", () => {
    const feeds = [makeFeed("https://example.com/feed")];
    expect(isSubscribed("https://example.com/feed", feeds)).toBe(true);
  });

  it("returns false when no match", () => {
    const feeds = [makeFeed("https://example.com/feed")];
    expect(isSubscribed("https://other.com/feed", feeds)).toBe(false);
  });

  it("matches ignoring trailing slashes", () => {
    const feeds = [makeFeed("https://example.com/feed/")];
    expect(isSubscribed("https://example.com/feed", feeds)).toBe(true);
  });

  it("matches when subscribed URL has no trailing slash but catalog does", () => {
    const feeds = [makeFeed("https://example.com/feed")];
    expect(isSubscribed("https://example.com/feed/", feeds)).toBe(true);
  });

  it("returns false for empty feeds array", () => {
    expect(isSubscribed("https://example.com/feed", [])).toBe(false);
  });
});

describe("findSubscribedFeed", () => {
  it("returns the matching feed object", () => {
    const feed = makeFeed("https://example.com/feed");
    const result = findSubscribedFeed("https://example.com/feed", [feed]);
    expect(result).toBe(feed);
  });

  it("matches with trailing slash normalization", () => {
    const feed = makeFeed("https://example.com/feed/");
    const result = findSubscribedFeed("https://example.com/feed", [feed]);
    expect(result).toBe(feed);
  });

  it("returns undefined when no match", () => {
    const feed = makeFeed("https://other.com/feed");
    expect(findSubscribedFeed("https://example.com/feed", [feed])).toBeUndefined();
  });

  it("returns undefined for empty feeds array", () => {
    expect(findSubscribedFeed("https://example.com/feed", [])).toBeUndefined();
  });
});
