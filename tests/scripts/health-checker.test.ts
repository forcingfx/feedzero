import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkFeedHealth,
  checkAllFeeds,
} from "../../scripts/lib/health-checker.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("checkFeedHealth", () => {
  it("returns true for a successful response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    expect(await checkFeedHealth("https://example.com/feed")).toBe(true);
  });

  it("returns true for redirect responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 301 }),
    );
    expect(await checkFeedHealth("https://example.com/feed")).toBe(true);
  });

  it("returns false for server errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    expect(await checkFeedHealth("https://example.com/feed")).toBe(false);
  });

  it("returns false for 404", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    expect(await checkFeedHealth("https://example.com/feed")).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkFeedHealth("https://example.com/feed")).toBe(false);
  });

  it("uses HEAD method", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    await checkFeedHealth("https://example.com/feed");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/feed",
      expect.objectContaining({ method: "HEAD" }),
    );
  });
});

describe("checkAllFeeds", () => {
  it("returns health status for all feeds", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const feeds = [
      { name: "A", feedUrl: "https://a.com/feed", siteUrl: "", healthy: true },
      { name: "B", feedUrl: "https://b.com/feed", siteUrl: "", healthy: true },
      { name: "C", feedUrl: "https://c.com/feed", siteUrl: "", healthy: true },
    ];

    const results = await checkAllFeeds(feeds);

    expect(results.get("https://a.com/feed")).toBe(true);
    expect(results.get("https://b.com/feed")).toBe(false);
    expect(results.get("https://c.com/feed")).toBe(true);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    vi.mocked(globalThis.fetch).mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return new Response(null, { status: 200 });
    });

    const feeds = Array.from({ length: 20 }, (_, i) => ({
      name: `Feed ${i}`,
      feedUrl: `https://feed${i}.com/rss`,
      siteUrl: "",
      healthy: true,
    }));

    await checkAllFeeds(feeds, 5);

    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });
});
