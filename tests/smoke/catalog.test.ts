// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: catalog persistence + cross-lambda visibility against the
 * live system. Catches the 2026-05-14 stats-always-zero bug shape:
 * /api/feed (proxy) and /api/catalog (reader) are separate lambdas. If
 * either falls back to the memory adapter, the proxy's writes never
 * reach the reader and stats silently report zero.
 *
 * This smoke test triggers a proxy fetch, then verifies the catalog
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

    // 2. Trigger a proxy fetch — this fires a fire-and-forget upsert
    //    into the catalog adapter.
    const proxyRes = await fetch(`${BASE_URL}/api/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: SENTINEL_FEED }),
    });
    expect(proxyRes.status).toBe(200);
    // Drain body so the lambda can complete the upsert.
    await proxyRes.arrayBuffer();

    // 3. Poll for the upsert to land. Fire-and-forget upserts in Vercel
    //    Lambda complete on a timescale that varies with cold-start state
    //    (50ms warm, several seconds cold). A fixed wait either over-waits
    //    or under-waits depending on lambda state. Polling at 1s intervals
    //    is more robust than a fixed sleep.
    const POLL_INTERVAL_MS = 1_000;
    const MAX_POLLS = 15;
    let afterCount = beforeCount;
    let afterBody: { ok: boolean; feed: { url: string; requestCount: number } } | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
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

    expect(afterBody).not.toBeNull();
    expect(afterBody!.ok).toBe(true);
    expect(afterBody!.feed.url).toBe(SENTINEL_FEED);
    expect(afterCount).toBeGreaterThan(beforeCount);
  }, 30_000);

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
});
