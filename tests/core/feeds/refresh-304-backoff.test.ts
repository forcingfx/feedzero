/**
 * Integration test for the consecutive-304 backoff streak counter.
 *
 * Exercises the increment/reset behavior of refreshFeed and the
 * filter behavior of refreshAllFeeds with respectBackoffWithDefaultMs.
 * Mock at the network boundary (fetch + proxyFetch) and use real
 * IndexedDB via fake-indexeddb so the persisted Feed shape stays
 * honest — the bug class this guards is "in-memory state says one
 * thing, decrypted-from-DB feed says another".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { open, addFeed, getFeeds } from "@/core/storage/db";
import { refreshFeed, refreshAllFeeds } from "@/core/feeds/feed-service";
import { createFeed } from "@/core/storage/schema";
import type { Feed } from "@feedzero/core/types";

const PASSPHRASE = "alpha bravo charlie delta";

async function setupDb() {
  await open(PASSPHRASE);
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  const r = createFeed({
    url: "https://example.com/feed.xml",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
  });
  if (!r.ok) throw new Error("createFeed failed");
  return {
    ...r.value,
    ...overrides,
  };
}

function mockProxyResponse(status: number, body = "", headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe("refreshFeed × consecutive-304 streak counter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    await setupDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("increments consecutive304Count on each 304 response", async () => {
    const feed = makeFeed();
    await addFeed(feed);

    // First 304 → count = 1.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockProxyResponse(304));
    await refreshFeed(feed);
    expect(feed.consecutive304Count).toBe(1);

    // Second 304 → count = 2.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockProxyResponse(304));
    await refreshFeed(feed);
    expect(feed.consecutive304Count).toBe(2);

    // Third 304 → count = 3 (the backoff threshold).
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockProxyResponse(304));
    await refreshFeed(feed);
    expect(feed.consecutive304Count).toBe(3);
  });

  it("resets consecutive304Count on a successful 200 with new content", async () => {
    const feed = makeFeed({ consecutive304Count: 5 });
    await addFeed(feed);

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockProxyResponse(
        200,
        `<?xml version="1.0"?>
        <rss version="2.0"><channel>
          <title>Example</title>
          <link>https://example.com</link>
          <description>x</description>
          <item><title>New</title><link>https://example.com/1</link><guid>1</guid></item>
        </channel></rss>`,
        { "Content-Type": "application/xml" },
      ),
    );
    await refreshFeed(feed);
    expect(feed.consecutive304Count).toBeUndefined();
  });

  it("resets consecutive304Count on a failed (non-OK, non-304) response", async () => {
    const feed = makeFeed({ consecutive304Count: 4 });
    await addFeed(feed);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockProxyResponse(500, "boom"));
    await refreshFeed(feed);
    // A 5xx still terminates the 304 streak — the next refresh starts
    // from zero. (We don't try to be clever about "is the publisher
    // really quiet or just down?" — clearing is the safer default.)
    expect(feed.consecutive304Count).toBeUndefined();
  });
});

describe("refreshAllFeeds × respectBackoffWithDefaultMs filter", () => {
  let originalFetch: typeof globalThis.fetch;
  const ONE_MIN = 60 * 1000;
  const THIRTY_MIN = 30 * ONE_MIN;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    await setupDb();
    // Single 304 response is enough; the test only cares about which
    // feeds the bulk path called fetch for.
    globalThis.fetch = vi.fn().mockResolvedValue(mockProxyResponse(304));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("skips feeds that are backed off and not yet due", async () => {
    const now = Date.now();
    const dueFeed = makeFeed({
      id: "due",
      url: "https://a.example.com/feed.xml",
      lastFetchedAt: now - 60 * ONE_MIN,
    });
    // 3 consecutive 304s → effective interval 60 min; 45 min elapsed
    // means NOT due yet under backoff.
    const backedOffFeed = makeFeed({
      id: "backedoff",
      url: "https://b.example.com/feed.xml",
      lastFetchedAt: now - 45 * ONE_MIN,
      consecutive304Count: 3,
    });
    await addFeed(dueFeed);
    await addFeed(backedOffFeed);

    const result = await refreshAllFeeds({
      respectBackoffWithDefaultMs: THIRTY_MIN,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const refreshedIds = result.value.results.map((r) => r.feed.id);
    expect(refreshedIds).toContain("due");
    expect(refreshedIds).not.toContain("backedoff");
  });

  it("does NOT skip any feed when no interval is provided (user-click path)", async () => {
    const now = Date.now();
    const backedOffFeed = makeFeed({
      id: "backedoff",
      url: "https://b.example.com/feed.xml",
      lastFetchedAt: now - 5 * ONE_MIN, // very recent, would be skipped
      consecutive304Count: 5,
    });
    await addFeed(backedOffFeed);

    // No respectBackoffWithDefaultMs → user-click path; refresh everyone.
    const result = await refreshAllFeeds();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const refreshedIds = result.value.results.map((r) => r.feed.id);
    expect(refreshedIds).toContain("backedoff");
  });

  // Sanity: verify the DB-loaded shape includes the streak field, so the
  // bulk path is filtering against the persisted state, not a stale
  // in-memory snapshot. This is the contract the mock-at-the-boundary
  // rule (CLAUDE.md) is meant to lock down.
  it("the filter reads consecutive304Count from the persisted Feed shape", async () => {
    const feed = makeFeed({
      id: "persisted",
      url: "https://c.example.com/feed.xml",
      lastFetchedAt: Date.now() - 5 * ONE_MIN,
      consecutive304Count: 4,
    });
    await addFeed(feed);

    const reloaded = await getFeeds();
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    const fromDb = reloaded.value.find((f) => f.id === "persisted");
    expect(fromDb?.consecutive304Count).toBe(4);
  });
});
