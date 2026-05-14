// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/stats-sync reads from the LIVE Upstash sync adapter
 * and returns the actual vault count. Catches the 2026-05-12 bug shape
 * (stats-sync hardcoded to Vercel Blob, returned 0 after the Upstash
 * migration even though sync was healthy).
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/stats-sync (live)", () => {
  it("returns a non-negative integer vault count", async () => {
    const res = await fetch(`${BASE_URL}/api/stats-sync`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Number.isInteger(body.vaults)).toBe(true);
    expect(body.vaults).toBeGreaterThanOrEqual(0);
  }, 10_000);

  it("returns vaults > 0 in production (catches stale-adapter regression)", async () => {
    // This is the assertion that would have caught the 2026-05-12 bug
    // on the first deploy. Production has 20+ vaults; if stats-sync ever
    // returns 0, either the adapter resolution regressed OR the Upstash
    // backend is empty (which would itself be a bug worth investigating).
    const res = await fetch(`${BASE_URL}/api/stats-sync`);
    const body = await res.json();
    expect(body.vaults).toBeGreaterThan(0);
  }, 10_000);
});
