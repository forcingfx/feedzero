// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: verifies the production proxy rate limiter is wired and
 * enforces its threshold against the live deployed system.
 *
 * Catches the class of bug where unit tests pass (the limiter logic is
 * correct in isolation) but the deployed env has the wrong adapter, a
 * missing salt env var, or skipped wiring in api/feed.ts → silent
 * disablement. Mocked tests can't see any of that.
 *
 * Skipped by default — runs only when `SMOKE_TESTS=1` is set:
 *
 *   SMOKE_TESTS=1 npx vitest run tests/smoke/
 *
 * Suitable for post-deploy verification (manually or via CI). Not part
 * of `npm test` because it hits real infrastructure and consumes a real
 * rate-limit bucket.
 *
 * Side effect: this test will exhaust the rate-limit bucket for the IP
 * it runs from. Do not run from a shared IP during active hours; wait
 * for the 60s window to elapse before re-running.
 */

const SKIP = !process.env.SMOKE_TESTS;

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const PROXY_URL = `${BASE_URL}/api/feed`;
// Use a known-good feed URL the proxy will accept. We don't care about
// the response payload — just the status code (200 vs 429).
const TARGET_FEED = "https://feedzero.app/releases.xml";
// Slightly over the production default of 300 req/min, so we expect a
// transition from 200s to 429s somewhere in the middle.
const BURST_COUNT = 320;
const RETRY_AFTER_FLOOR_SEC = 1;
const RETRY_AFTER_CEIL_SEC = 60;

async function callProxy(): Promise<{ status: number; retryAfter: string | null }> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: TARGET_FEED }),
  });
  // Drain body so the connection can be reused.
  await res.arrayBuffer();
  return { status: res.status, retryAfter: res.headers.get("Retry-After") };
}

describe.skipIf(SKIP)("production proxy rate limiter (live)", () => {
  it(`hammering ${PROXY_URL} produces 429s with Retry-After`, async () => {
    // Sequential, not parallel — parallel would saturate the lambda's
    // concurrent-fetch budget and produce noise unrelated to the limiter.
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

    // We MUST see some 200s (the proxy was reachable) AND some 429s
    // (the limiter actually engaged). Either side being zero is a
    // failure.
    expect(ok).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(0);

    // RFC 6585: 429 SHOULD include Retry-After. Production must comply.
    expect(firstRetryAfter).toBeTruthy();
    if (firstRetryAfter) {
      const retryAfterSec = Number.parseInt(firstRetryAfter, 10);
      expect(retryAfterSec).toBeGreaterThanOrEqual(RETRY_AFTER_FLOOR_SEC);
      expect(retryAfterSec).toBeLessThanOrEqual(RETRY_AFTER_CEIL_SEC);
    }
  }, 120_000); // generous: 320 sequential requests at ~200ms each = ~64s

  it("the proxy is not rate-limited after the window resets", async () => {
    // Defensive: if the previous test ran in the same window, the bucket
    // is exhausted and this would 429 spuriously. Wait until the window
    // resets before asserting "normal traffic is allowed".
    //
    // We assert `!== 429` rather than `=== 200` because the proxy may
    // return other non-rate-limit statuses orthogonal to the limiter
    // (e.g. 403 from Vercel bot protection when the fetch is sent with
    // a Node-style User-Agent). The *intent* of this test is "the
    // limiter is no longer blocking", which `!== 429` captures exactly.
    await new Promise((r) => setTimeout(r, 65_000));
    const { status } = await callProxy();
    expect(status).not.toBe(429);
  }, 90_000);
});
