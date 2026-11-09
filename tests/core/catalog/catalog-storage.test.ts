import { describe, it, expect } from "vitest";
import { createMemoryCatalogAdapter } from "@/core/catalog/adapters/memory-adapter.ts";
import type { CatalogFeed } from "@/core/catalog/catalog-types.ts";

describe("CatalogStorageAdapter (memory)", () => {
  it("upsert creates a new feed entry", async () => {
    const adapter = createMemoryCatalogAdapter();
    const result = await adapter.upsert("https://example.com/feed.xml");

    expect(result.ok).toBe(true);

    const feed = await adapter.get("https://example.com/feed.xml");
    expect(feed.ok).toBe(true);
    if (!feed.ok) return;
    expect(feed.value).not.toBeNull();
    expect(feed.value!.url).toBe("https://example.com/feed.xml");
    expect(feed.value!.requestCount).toBe(1);
    expect(feed.value!.status).toBe("active");
  });

  it("upsert increments requestCount on existing feed", async () => {
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://example.com/feed.xml");
    await adapter.upsert("https://example.com/feed.xml");
    await adapter.upsert("https://example.com/feed.xml");

    const feed = await adapter.get("https://example.com/feed.xml");
    if (!feed.ok) return;
    expect(feed.value!.requestCount).toBe(3);
  });

  it("does not expose lastRequestedAt (no adapter keeps it current; see ADR 008)", async () => {
    // The Upstash adapter stopped rewriting the record on every fetch to
    // stay within 2 billed commands per upsert, so a per-request timestamp
    // can no longer be honest. Both adapters drop it so the contract agrees.
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://example.com/feed.xml");
    const feed = await adapter.get("https://example.com/feed.xml");
    if (!feed.ok) throw new Error(feed.error);
    expect(feed.value).not.toHaveProperty("lastRequestedAt");
  });

  it("get returns null for unknown feed", async () => {
    const adapter = createMemoryCatalogAdapter();
    const result = await adapter.get("https://unknown.com/feed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("popular returns feeds sorted by requestCount descending", async () => {
    const adapter = createMemoryCatalogAdapter();

    // Feed A: 1 request
    await adapter.upsert("https://a.com/feed");
    // Feed B: 3 requests
    await adapter.upsert("https://b.com/feed");
    await adapter.upsert("https://b.com/feed");
    await adapter.upsert("https://b.com/feed");
    // Feed C: 2 requests
    await adapter.upsert("https://c.com/feed");
    await adapter.upsert("https://c.com/feed");

    const result = await adapter.popular(10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((f) => f.url)).toEqual([
      "https://b.com/feed",
      "https://c.com/feed",
      "https://a.com/feed",
    ]);
  });

  it("popular respects limit parameter", async () => {
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://a.com/feed");
    await adapter.upsert("https://b.com/feed");
    await adapter.upsert("https://c.com/feed");

    const result = await adapter.popular(2);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it("updateMetadata merges partial updates", async () => {
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://example.com/feed.xml");

    await adapter.updateMetadata("https://example.com/feed.xml", {
      title: "Example Feed",
      siteUrl: "https://example.com",
      status: "active",
    });

    const feed = await adapter.get("https://example.com/feed.xml");
    if (!feed.ok) return;
    expect(feed.value!.title).toBe("Example Feed");
    expect(feed.value!.siteUrl).toBe("https://example.com");
    expect(feed.value!.requestCount).toBe(1); // preserved
  });

  it("count returns total number of feeds", async () => {
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://a.com/feed");
    await adapter.upsert("https://b.com/feed");

    const result = await adapter.count();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(2);
  });

  it("catalog entry has no user-identifying fields", async () => {
    const adapter = createMemoryCatalogAdapter();
    await adapter.upsert("https://example.com/feed.xml");

    const feed = await adapter.get("https://example.com/feed.xml");
    if (!feed.ok) return;
    const entry = feed.value as CatalogFeed;

    // Verify no user-identifying fields exist
    expect(entry).not.toHaveProperty("userId");
    expect(entry).not.toHaveProperty("userAgent");
    expect(entry).not.toHaveProperty("ip");
    expect(entry).not.toHaveProperty("sessionId");
    expect(entry).not.toHaveProperty("vaultId");
  });
});
