// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/license/verify is reachable, rejects invalid tokens
 * with 401, and includes a traceId in the error response (PR #43
 * observability contract).
 *
 * We don't have a way to test the SUCCESS path here without minting a
 * real production license, which would either (a) require committing
 * the admin token to the smoke test (a security violation) or (b)
 * leave a real license in production storage. So this smoke test
 * verifies endpoint reachability + the error path's observability
 * contract — both of which were silently broken in past iterations
 * (bundled wrappers hardcoding the wrong storage adapter).
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/license/verify (live)", () => {
  it("rejects an invalid token with 401 + traceId in the body", async () => {
    const res = await fetch(`${BASE_URL}/api/license/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects a missing-body request with 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/license/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects non-POST methods with 405", async () => {
    const res = await fetch(`${BASE_URL}/api/license/verify`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  }, 10_000);
});
