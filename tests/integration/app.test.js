import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  addFeed,
  getFeeds,
  addArticles,
  getArticles,
} from "../../src/core/storage/db.ts";
import { parse } from "../../src/core/parser/parser.ts";
import { createFeed, createArticle } from "../../src/core/storage/schema.ts";
import { isOk, unwrap } from "@feedzero/core/utils/result";

describe("App Integration", () => {
  beforeEach(async () => {
    const result = await open("test-key");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  it("should complete full flow: parse → store → retrieve", async () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <link>https://test.com</link>
    <description>A test blog</description>
    <item>
      <title>Hello World</title>
      <link>https://test.com/hello</link>
      <description>&lt;p&gt;First post&lt;/p&gt;</description>
      <pubDate>Wed, 10 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    // Parse
    const parseResult = parse(rss, "https://test.com/feed");
    expect(isOk(parseResult)).toBe(true);
    const { feed: feedData, articles: parsedArticles } = unwrap(parseResult);

    // Store feed
    const feedResult = createFeed({
      url: "https://test.com/feed",
      title: feedData.title,
    });
    expect(isOk(feedResult)).toBe(true);
    const feed = unwrap(feedResult);
    await addFeed(feed);

    // Store articles
    const articles = parsedArticles.map((a) =>
      unwrap(createArticle({ feedId: feed.id, ...a })),
    );
    await addArticles(articles);

    // Retrieve
    const feeds = unwrap(await getFeeds());
    expect(feeds).toHaveLength(1);
    expect(feeds[0].title).toBe("Test Blog");

    const stored = unwrap(await getArticles(feed.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Hello World");
    expect(stored[0].content).toContain("First post");
    expect(stored[0].content).not.toContain("<script>");
  });
});
