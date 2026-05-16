/**
 * /api/license/recover — Stripe Customer Portal magic-link entry point.
 *
 * Public endpoint: accepts an email, looks up the Stripe customer, returns a
 * portal session URL with a signed recovery token embedded in its return_url.
 *
 * Security properties verified by these tests:
 * - Unknown emails get a generic 200 response with no portalUrl (enumeration protection)
 * - Known emails get a portalUrl pointing at billing.stripe.com (the portal session)
 * - The return_url contains a recovery token that's HMAC-signed by us
 * - Malformed input is rejected (400) before any Stripe call
 * - Stripe API failures degrade to 502 with a traceId
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleLicenseRecoverRequest,
  signRecoveryToken,
  verifyRecoveryToken,
} from "@/core/license/recover-handler";

function makeRequest(body: unknown): Request {
  return new Request("https://my.feedzero.app/api/license/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SIGNING_KEY = { secret: "test-signing-key-32-chars-or-more-please" };
const RETURN_BASE = "https://my.feedzero.app/billing/issued";

describe("handleLicenseRecoverRequest", () => {
  it("405 on non-POST", async () => {
    const req = new Request("https://my.feedzero.app/api/license/recover", {
      method: "GET",
    });
    const res = await handleLicenseRecoverRequest(req, {
      customers: { list: vi.fn() },
      portal: { create: vi.fn() },
      signingKey: SIGNING_KEY,
      returnUrlBase: RETURN_BASE,
    });
    expect(res.status).toBe(405);
  });

  it("400 on missing email", async () => {
    const res = await handleLicenseRecoverRequest(makeRequest({}), {
      customers: { list: vi.fn() },
      portal: { create: vi.fn() },
      signingKey: SIGNING_KEY,
      returnUrlBase: RETURN_BASE,
    });
    expect(res.status).toBe(400);
  });

  it("400 on malformed email", async () => {
    const res = await handleLicenseRecoverRequest(
      makeRequest({ email: "not-an-email" }),
      {
        customers: { list: vi.fn() },
        portal: { create: vi.fn() },
        signingKey: SIGNING_KEY,
        returnUrlBase: RETURN_BASE,
      },
    );
    expect(res.status).toBe(400);
  });

  it("200 with no portalUrl when email isn't a known customer (enumeration protection)", async () => {
    const customers = { list: vi.fn().mockResolvedValue({ data: [] }) };
    const portal = { create: vi.fn() };
    const res = await handleLicenseRecoverRequest(
      makeRequest({ email: "unknown@example.com" }),
      {
        customers,
        portal,
        signingKey: SIGNING_KEY,
        returnUrlBase: RETURN_BASE,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.portalUrl).toBeUndefined();
    expect(portal.create).not.toHaveBeenCalled();
  });

  it("200 with portalUrl + signed-token return_url when email matches a customer", async () => {
    const customers = {
      list: vi.fn().mockResolvedValue({
        data: [{ id: "cus_real123", email: "real@example.com" }],
      }),
    };
    const portal = {
      create: vi
        .fn()
        .mockResolvedValue({ url: "https://billing.stripe.com/p/session_abc" }),
    };
    const res = await handleLicenseRecoverRequest(
      makeRequest({ email: "real@example.com" }),
      {
        customers,
        portal,
        signingKey: SIGNING_KEY,
        returnUrlBase: RETURN_BASE,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.portalUrl).toBe("https://billing.stripe.com/p/session_abc");
    // The Stripe portal create call carries the return_url with our recovery token
    expect(portal.create).toHaveBeenCalledTimes(1);
    const callArg = portal.create.mock.calls[0][0];
    expect(callArg.customer).toBe("cus_real123");
    expect(callArg.return_url).toMatch(new RegExp(`^${RETURN_BASE}\\?recovery=`));
    // And the token in return_url verifies back to the same customer
    const url = new URL(callArg.return_url);
    const token = url.searchParams.get("recovery");
    expect(token).toBeTruthy();
    const verified = await verifyRecoveryToken(token!, SIGNING_KEY);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.customerId).toBe("cus_real123");
    }
  });

  it("502 when Stripe customer lookup throws", async () => {
    const customers = {
      list: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const res = await handleLicenseRecoverRequest(
      makeRequest({ email: "boom@example.com" }),
      {
        customers,
        portal: { create: vi.fn() },
        signingKey: SIGNING_KEY,
        returnUrlBase: RETURN_BASE,
      },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toBeTruthy();
  });
});

describe("recovery token sign/verify round-trip", () => {
  it("verifies a freshly-signed token", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_x", exp: Math.floor(Date.now() / 1000) + 900 },
      SIGNING_KEY,
    );
    const result = await verifyRecoveryToken(token, SIGNING_KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.customerId).toBe("cus_x");
  });

  it("rejects an expired token", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_x", exp: Math.floor(Date.now() / 1000) - 1 },
      SIGNING_KEY,
    );
    const result = await verifyRecoveryToken(token, SIGNING_KEY);
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with a different key (forged)", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_x", exp: Math.floor(Date.now() / 1000) + 900 },
      { secret: "attacker-key-32-chars-or-more-zzzzzzzzz" },
    );
    const result = await verifyRecoveryToken(token, SIGNING_KEY);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const result = await verifyRecoveryToken("garbage", SIGNING_KEY);
    expect(result.ok).toBe(false);
  });
});
