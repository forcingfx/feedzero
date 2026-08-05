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

/**
 * This test needs to exceed 300 req/min against a live endpoint whose own
 * latency is ~230ms per call. Measured from a single client on 2026-08-05:
 * 480 requests at concurrency 60 achieved only ~259 req/min — the proxy's
 * round-trip, not the client, is the ceiling. So one machine cannot make the
 * limiter engage, and leaving the test enabled means a permanently red smoke
 * suite that reports a regression that isn't there.
 *
 * Set SMOKE_LOAD_CAPABLE=1 to run it from somewhere that can actually sustain
 * >300 req/min (a load generator, or several runners in parallel).
 *
 * Note this means the production limiter is currently UNVERIFIED end-to-end.
 * Its activation also depends on deployment env (Upstash credentials plus a
 * salt — see resolveProxyRateLimiter); confirm those are set rather than
 * inferring from this test's absence.
 */
const SKIP = !process.env.SMOKE_TESTS || !process.env.SMOKE_LOAD_CAPABLE;

const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const PROXY_URL = `${BASE_URL}/api/feed`;
// Use a known-good feed URL the proxy will accept. We don't care about
// the response payload — just the status code (200 vs 429).
const TARGET_FEED = "https://feedzero.app/releases.xml";
// Slightly over the production default of 300 req/min, so we expect a
// transition from 200s to 429s somewhere in the middle.
const BURST_COUNT = 480;
// Fired in parallel batches so the burst lands inside a single 60s window.
const CONCURRENCY = 60;
const EXPECTED_LIMIT_PER_MIN = 300;
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
    // Concurrency, not a sequential loop. The original version fired 320
    // requests one at a time; at the proxy's ~200-250ms per call that spans
    // 75-90s, which is LONGER than the 60s limiter window. The bucket
    // refilled underneath it, so it could never cross the threshold and just
    // timed out — reporting a broken limiter when it had merely failed to
    // generate enough load. Measured 2026-08-05: 420 sequential-ish requests
    // achieved ~286 req/min against a 300/min limit.
    const started = Date.now();
    const statuses: number[] = [];
    let firstRetryAfter: string | null = null;

    for (let batch = 0; batch < BURST_COUNT / CONCURRENCY; batch++) {
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => callProxy()),
      );
      for (const { status, retryAfter } of results) {
        statuses.push(status);
        if (status === 429 && firstRetryAfter === null) {
          firstRetryAfter = retryAfter;
        }
      }
      if (firstRetryAfter) break; // limiter engaged; no need to keep spending
    }

    const elapsedSec = (Date.now() - started) / 1000;
    const achievedPerMin = Math.round((statuses.length / elapsedSec) * 60);
    const ok = statuses.filter((s) => s === 200).length;
    const limited = statuses.filter((s) => s === 429).length;

    expect(ok, "proxy was never reachable").toBeGreaterThan(0);

    // If we never crossed the threshold, say so precisely. A bare "expected
    // > 0" would read as "the limiter is broken" when the real answer may be
    // "this client cannot generate enough load from here".
    expect(
      limited,
      `No 429s in ${statuses.length} requests over ${elapsedSec.toFixed(1)}s ` +
        `(~${achievedPerMin} req/min). Either the limiter is not configured in ` +
        `this environment (it needs Upstash credentials AND a salt — see ` +
        `resolveProxyRateLimiter), or this client could not exceed the ` +
        `${EXPECTED_LIMIT_PER_MIN}/min threshold. Check the deployment's env ` +
        `before assuming a regression.`,
    ).toBeGreaterThan(0);

    // RFC 6585: 429 SHOULD include Retry-After. Production must comply.
    expect(firstRetryAfter).toBeTruthy();
    if (firstRetryAfter) {
      const retryAfterSec = Number.parseInt(firstRetryAfter, 10);
      expect(retryAfterSec).toBeGreaterThanOrEqual(RETRY_AFTER_FLOOR_SEC);
      expect(retryAfterSec).toBeLessThanOrEqual(RETRY_AFTER_CEIL_SEC);
    }
  }, 180_000);

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
