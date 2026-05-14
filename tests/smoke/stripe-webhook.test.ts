// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/stripe/webhook is reachable AND enforces signature
 * verification. We can't send a *valid* signed Stripe event in
 * production without either committing the webhook secret (security
 * violation) or actually processing fake subscription events (would
 * corrupt the license store), so the smoke test asserts only the
 * defensive paths.
 *
 * Asserts:
 *  - 400 + traceId on missing Stripe-Signature header
 *  - 400 + traceId on malformed signature
 *  - 405 on non-POST
 *
 * Catches: endpoint not deployed, signature verification disabled,
 * structured-error wiring regressed.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/stripe/webhook (live)", () => {
  it("rejects a request with no Stripe-Signature header — 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "customer.subscription.created" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects a malformed Stripe-Signature header — 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "garbage-not-stripe-format",
      },
      body: JSON.stringify({ type: "x" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects non-POST methods with 405", async () => {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  }, 10_000);
});
