// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: catalog persistence + cross-lambda visibility against the
 * live system. Catches the 2026-05-14 stats-always-zero bug shape:
 * /api/feed (proxy) and /api/catalog (reader) are separate lambdas. If
 * either falls back to the memory adapter, the proxy's writes never
 * reach the reader and stats silently report zero.
 *
 * This smoke test triggers proxy fetches, then verifies the catalog
 * /api/catalog?url=<...> shows the upserted entry — proving the same
 * Upstash backend is hit by both lambdas.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 *
 * Side effect: increments the requestCount for the sentinel feed URL.
 * The sentinel is a public, real feed we already track for the release
 * notes — so the increment is indistinguishable from organic traffic
 * and requires no cleanup.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const SENTINEL_FEED = "https://feedzero.app/releases.xml";

describe.skipIf(SKIP)("production /api/catalog (live)", () => {
  it("a proxy fetch is observable in the catalog (cross-lambda persistence)", async () => {
    // 1. Capture the BEFORE state for the sentinel feed.
    const before = await fetch(
      `${BASE_URL}/api/catalog?url=${encodeURIComponent(SENTINEL_FEED)}`,
    );
    const beforeCount =
      before.status === 200
        ? (await before.json()).feed.requestCount
        : 0;

    // 2. Trigger proxy fetches until one is counted. Production samples one
    //    hit in ten, so a single fetch usually records nothing. 45 fetches
    //    miss the sample less than 1% of the time and stay inside the
    //    proxy's rate limit. Each upsert is fire-and-forget, so poll briefly
    //    after every small batch.
    const FETCH_BATCHES = 9;
    const FETCHES_PER_BATCH = 5;
    const POLL_INTERVAL_MS = 1_000;
    const POLLS_PER_BATCH = 2;
    let afterCount = beforeCount;
    let afterBody: { ok: boolean; feed: { url: string; requestCount: number } } | null = null;
    for (let batch = 0; batch < FETCH_BATCHES && afterCount <= beforeCount; batch++) {
      const responses = await Promise.all(
        Array.from({ length: FETCHES_PER_BATCH }, () =>
          fetch(`${BASE_URL}/api/feed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: SENTINEL_FEED }),
          }),
        ),
      );
      for (const response of responses) {
        expect(response.status).toBe(200);
        // Drain body so the lambda can complete the upsert.
        await response.arrayBuffer();
      }

      for (let poll = 0; poll < POLLS_PER_BATCH; poll++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const after = await fetch(
          `${BASE_URL}/api/catalog?url=${encodeURIComponent(SENTINEL_FEED)}`,
        );
        if (after.status !== 200) continue;
        afterBody = await after.json();
        if (afterBody && afterBody.ok) {
          afterCount = afterBody.feed.requestCount;
          if (afterCount > beforeCount) break;
        }
      }
    }

    expect(afterBody).not.toBeNull();
    expect(afterBody!.ok).toBe(true);
    expect(afterBody!.feed.url).toBe(SENTINEL_FEED);
    expect(afterCount).toBeGreaterThan(beforeCount);
  }, 60_000);

  it("/api/catalog?action=count returns a positive integer", async () => {
    const res = await fetch(`${BASE_URL}/api/catalog?action=count`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Number.isInteger(body.count)).toBe(true);
    // After the persistent-catalog fix, count must be > 0 in production
    // (we know 28+ feeds are tracked). Asserting > 0 here would have
    // caught the original "stats always zero" bug before users did.
    expect(body.count).toBeGreaterThan(0);
  }, 10_000);

  it("/api/catalog?action=popular returns a non-empty leaderboard", async () => {
    const res = await fetch(
      `${BASE_URL}/api/catalog?action=popular&limit=5`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.feeds)).toBe(true);
    expect(body.feeds.length).toBeGreaterThan(0);
    // Every entry has the shape the stats UI consumes.
    for (const feed of body.feeds) {
      expect(typeof feed.url).toBe("string");
      expect(typeof feed.requestCount).toBe("number");
      expect(feed.requestCount).toBeGreaterThan(0);
    }
  }, 10_000);

  it("popular counts come from the ranking: sorted descending, no stale lastRequestedAt", async () => {
    // After the ZINCRBY change the ranking score is the only request
    // count. If records and ranking disagreed (e.g. a read path still
    // returning a record's frozen requestCount), the leaderboard would
    // come back out of order. lastRequestedAt is no longer maintained,
    // so echoing a legacy value would misreport recency.
    const res = await fetch(
      `${BASE_URL}/api/catalog?action=popular&limit=20`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const counts: number[] = body.feeds.map(
      (f: { requestCount: number }) => f.requestCount,
    );
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    for (const feed of body.feeds) {
      expect(feed).not.toHaveProperty("lastRequestedAt");
    }
  }, 10_000);
});
