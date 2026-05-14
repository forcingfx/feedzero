// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/health basic reachability check. The cheapest possible
 * smoke test — confirms the deployment is alive, the function bundling
 * worked, and the lambda cold-starts cleanly. Add to any post-deploy
 * verification script as the first gate.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/health (live)", () => {
  it("returns 200 with {ok: true}", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.time).toBe("string");
    // ISO timestamp parseable
    expect(new Date(body.time).toString()).not.toBe("Invalid Date");
  }, 10_000);
});
