// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: cross-device license recovery endpoints are reachable and
 * return the expected structured-error shapes.
 *
 * Covers what unit tests can't — that the Vercel deployment actually has
 * /api/license/recover and /api/license/issue-from-recovery wired through
 * the dispatcher. A unit-green + smoke-red here means the routes
 * compiled but didn't deploy (the dispatcher regression we already hit
 * once for recover during PR #83).
 *
 * Doesn't exercise the happy path (no real Stripe portal session
 * creation, no real magic-link email) — just verifies the public-facing
 * boundary returns the right shape for invalid inputs. Sufficient signal
 * that the endpoint is live AND the error path is the one we shipped.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production license-recovery endpoints (live)", () => {
  it("/api/license/recover returns 200 + enumeration-safe shape for unknown email", async () => {
    const res = await fetch(`${BASE_URL}/api/license/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // A clearly-fake email that should not match any Stripe customer
        email: `smoke-test-${Date.now()}@invalid.example.com`,
      }),
    });
    // Endpoint registered: handler returns 200 with no portalUrl
    // (enumeration protection — same shape as a real customer would get
    // pre-portal-session-creation, so an observer can't distinguish).
    // If we get 404 here, the dispatcher arm for "recover" was dropped.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Unknown email → no portalUrl
    expect(body.portalUrl).toBeUndefined();
  }, 15_000);

  it("/api/license/recover rejects malformed email — 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/license/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("/api/license/issue-from-recovery rejects missing recoveryToken — 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/license/issue-from-recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("/api/license/issue-from-recovery rejects a forged recoveryToken — 401 + traceId", async () => {
    // Garbage token signed with no key. Should fail signature verification
    // (we use HMAC; the forged signature can't possibly verify).
    const forged =
      "eyJjdXN0b21lcklkIjoiY3VzX2F0dGFja2VyIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature_garbage";
    const res = await fetch(`${BASE_URL}/api/license/issue-from-recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryToken: forged }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);
});
