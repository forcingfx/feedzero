import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOk, isErr, unwrap } from "../../../src/utils/result.ts";

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Preview Feed</title>
  <subtitle>A feed to preview</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Article One</title>
    <link href="https://example.com/1" rel="alternate"/>
    <id>tag:example.com,2024:1</id>
    <published>2024-01-15T12:00:00Z</published>
    <summary>Summary of article one.</summary>
  </entry>
  <entry>
    <title>Article Two</title>
    <link href="https://example.com/2" rel="alternate"/>
    <id>tag:example.com,2024:2</id>
    <published>2024-01-14T12:00:00Z</published>
    <summary>Summary of article two.</summary>
  </entry>
</feed>`;

// Mock proxyFetch to avoid real network calls
vi.mock("../../../src/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn(),
}));

// Mock DB modules to ensure preview does NOT write to DB
vi.mock("../../../src/core/storage/db.ts", () => ({
  feedExistsByUrl: vi.fn(),
  addFeed: vi.fn(),
  addArticles: vi.fn(),
  getFeeds: vi.fn(),
  removeFeedsByUrl: vi.fn(),
  getArticleByGuid: vi.fn(),
  updateArticles: vi.fn(),
}));

import { previewFeed } from "../../../src/core/feeds/feed-service.ts";
import { proxyFetch } from "../../../src/core/proxy/proxy-fetch.ts";
import * as db from "../../../src/core/storage/db.ts";

describe("previewFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed feed title and articles without DB writes", async () => {
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response(ATOM_XML, { status: 200 }),
    );

    const result = await previewFeed("https://example.com/feed");

    expect(isOk(result)).toBe(true);
    const preview = unwrap(result);
    expect(preview.title).toBe("Preview Feed");
    expect(preview.articles).toHaveLength(2);
    expect(preview.articles[0].title).toBe("Article One");
    expect(preview.articles[1].title).toBe("Article Two");

    // Must NOT write to database
    expect(db.addFeed).not.toHaveBeenCalled();
    expect(db.addArticles).not.toHaveBeenCalled();
  });

  it("returns error when fetch fails", async () => {
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await previewFeed("https://example.com/feed");

    expect(isErr(result)).toBe(true);
  });

  it("returns error when content is not a valid feed", async () => {
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response("<html><body>Not a feed</body></html>", { status: 200 }),
    );

    const result = await previewFeed("https://example.com/page");

    expect(isErr(result)).toBe(true);
  });

  it("returns articles with summary text", async () => {
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response(ATOM_XML, { status: 200 }),
    );

    const result = await previewFeed("https://example.com/feed");
    const preview = unwrap(result);

    expect(preview.articles[0].summary).toContain("Summary of article one");
  });

  it("returns siteUrl from parsed feed", async () => {
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response(ATOM_XML, { status: 200 }),
    );

    const result = await previewFeed("https://example.com/feed");
    const preview = unwrap(result);

    expect(preview.siteUrl).toBe("https://example.com");
  });
});
