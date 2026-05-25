// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: verifies the production /api/page proxy
 *   1. fetches a real article with a browser User-Agent (so WAFs like
 *      Cloudflare don't return a challenge page that defeats Defuddle),
 *   2. returns HTML the client side can extract from, and
 *   3. enforces the rate limiter — exhausting the bucket produces 429s
 *      with Retry-After, the same way `/api/feed` does.
 *
 * Catches the class of bug where unit tests pass (UA constant is right
 * in src/) but the deployed bundle has stale code (cold-start cache,
 * partial Vercel deploy) or the live limiter is silently disabled. Mocked
 * tests can't see either.
 *
 * Skipped by default — runs only when `SMOKE_TESTS=1` is set:
 *
 *   SMOKE_TESTS=1 npx vitest run tests/smoke/page-proxy.test.ts
 *
 * Side effect: this test exhausts the rate-limit bucket for the IP it
 * runs from. Do not run from a shared IP during active hours; wait for
 * the 60s window to elapse before re-running.
 */

const SKIP = !process.env.SMOKE_TESTS;

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const PAGE_URL = `${BASE_URL}/api/page`;
// A predictable, free, low-traffic article URL we control end-to-end:
// the releases page on the marketing site. No paywall, no UA challenge,
// stable content. We don't assert on the BODY, only that the proxy can
// fetch it under the browser-UA path.
const TARGET_PAGE = "https://feedzero.app/releases";
const BURST_COUNT = 320;
const RETRY_AFTER_FLOOR_SEC = 1;
const RETRY_AFTER_CEIL_SEC = 60;

async function callProxy(): Promise<{
  status: number;
  retryAfter: string | null;
  contentType: string | null;
}> {
  const res = await fetch(PAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: TARGET_PAGE }),
  });
  await res.arrayBuffer();
  return {
    status: res.status,
    retryAfter: res.headers.get("Retry-After"),
    contentType: res.headers.get("Content-Type"),
  };
}

describe.skipIf(SKIP)("production /api/page proxy (live)", () => {
  it("fetches a real page and returns HTML (browser-UA path works)", async () => {
    const { status, contentType } = await callProxy();
    // 200 expected — TARGET_PAGE is publicly accessible. A 502/403 here
    // means the deployed UA policy is wrong (the FeedZero identifier got
    // blocked by an upstream WAF) or the bundle is stale.
    expect(status).toBe(200);
    expect(contentType ?? "").toMatch(/html/i);
  });

  it(`hammering ${PAGE_URL} produces 429s with Retry-After`, async () => {
    const statuses: number[] = [];
    let firstRetryAfter: string | null = null;

    for (let i = 0; i < BURST_COUNT; i++) {
      const { status, retryAfter } = await callProxy();
      statuses.push(status);
      if (status === 429 && firstRetryAfter === null) {
        firstRetryAfter = retryAfter;
      }
    }

    const ok = statuses.filter((s) => s === 200).length;
    const limited = statuses.filter((s) => s === 429).length;

    expect(ok).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(0);

    expect(firstRetryAfter).toBeTruthy();
    if (firstRetryAfter) {
      const retryAfterSec = Number.parseInt(firstRetryAfter, 10);
      expect(retryAfterSec).toBeGreaterThanOrEqual(RETRY_AFTER_FLOOR_SEC);
      expect(retryAfterSec).toBeLessThanOrEqual(RETRY_AFTER_CEIL_SEC);
    }
  }, 120_000);
});
