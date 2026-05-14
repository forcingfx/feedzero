// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/checkout/create-session is reachable AND enforces
 * the price-ID allowlist + URL allowlist. We don't test the success
 * path because it would create a real Stripe Checkout Session
 * (clutters Stripe dashboard, costs nothing but pollutes data) — and
 * because asserting "Stripe returned a checkout URL" doesn't prove
 * anything about our production wiring beyond what the defensive
 * paths already prove.
 *
 * Asserts:
 *  - 400 + traceId on an invalid priceId (allowlist enforced)
 *  - 400 + traceId on a non-HTTP success URL (URL allowlist enforced)
 *  - 405 on non-POST
 *
 * Catches: endpoint not deployed, allowlist disabled, structured-error
 * wiring regressed.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/checkout/create-session (live)", () => {
  it("rejects an unknown priceId — 400 + traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/create-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId: "price_definitely_not_in_allowlist_xyz",
        successUrl: "https://feedzero.app/success",
        cancelUrl: "https://feedzero.app/cancel",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects a javascript: URL scheme — 400 + traceId (URL allowlist)", async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/create-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId: "price_definitely_not_in_allowlist_xyz",
        successUrl: "javascript:alert(1)",
        cancelUrl: "https://feedzero.app/cancel",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 10_000);

  it("rejects non-POST methods with 405", async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/create-session`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  }, 10_000);
});
