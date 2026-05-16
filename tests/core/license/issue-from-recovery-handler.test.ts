/**
 * /api/license/issue-from-recovery — completes the Stripe-portal recovery
 * by exchanging a signed recovery token for the customer's license token.
 *
 * Verified properties:
 * - Only HMAC-validated recovery tokens are accepted (forgery rejected)
 * - Expired recovery tokens are rejected
 * - Customer must have an active subscription (defense in depth — even if
 *   the recovery token was signed, the customer may have cancelled in the
 *   portal before clicking Return)
 * - Customer must have a non-revoked LicenseRecord in storage
 * - Returns the re-signed license token on success
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleIssueFromRecoveryRequest,
  type IssueFromRecoveryHandlerOptions,
} from "@/core/license/issue-from-recovery-handler";
import { signRecoveryToken } from "@/core/license/recover-handler";

const SIGNING_KEY = { secret: "test-signing-key-32-chars-or-more-please" };

function makeRequest(body: unknown): Request {
  return new Request(
    "https://my.feedzero.app/api/license/issue-from-recovery",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    customerId: "cus_real123",
    subscriptionId: "sub_test",
    tier: "personal" as const,
    status: "active" as const,
    expirySec: Math.floor(Date.now() / 1000) + 31_536_000,
    issuedAtSec: Math.floor(Date.now() / 1000) - 60,
    ...overrides,
  };
}

function baseOptions(): IssueFromRecoveryHandlerOptions {
  return {
    signingKey: SIGNING_KEY,
    storage: {
      listByCustomer: vi.fn().mockResolvedValue({
        ok: true,
        value: [makeRecord()],
      }),
      isRevoked: vi.fn().mockResolvedValue({ ok: true, value: false }),
    } as never,
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({ status: "active" }),
    },
  };
}

describe("handleIssueFromRecoveryRequest", () => {
  it("405 on non-POST", async () => {
    const req = new Request(
      "https://my.feedzero.app/api/license/issue-from-recovery",
      { method: "GET" },
    );
    const res = await handleIssueFromRecoveryRequest(req, baseOptions());
    expect(res.status).toBe(405);
  });

  it("400 on missing recoveryToken", async () => {
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({}),
      baseOptions(),
    );
    expect(res.status).toBe(400);
  });

  it("401 on forged recoveryToken (different signing key)", async () => {
    const forged = await signRecoveryToken(
      { customerId: "cus_attacker", exp: Math.floor(Date.now() / 1000) + 900 },
      { secret: "attacker-key-32-chars-or-more-zzzzzzzzz" },
    );
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({ recoveryToken: forged }),
      baseOptions(),
    );
    expect(res.status).toBe(401);
  });

  it("401 on expired recoveryToken", async () => {
    const expired = await signRecoveryToken(
      { customerId: "cus_real123", exp: Math.floor(Date.now() / 1000) - 1 },
      SIGNING_KEY,
    );
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({ recoveryToken: expired }),
      baseOptions(),
    );
    expect(res.status).toBe(401);
  });

  it("404 when no LicenseRecord exists for the customer", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_no_record", exp: Math.floor(Date.now() / 1000) + 900 },
      SIGNING_KEY,
    );
    const opts = baseOptions();
    (opts.storage.listByCustomer as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: true, value: [] },
    );
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({ recoveryToken: token }),
      opts,
    );
    expect(res.status).toBe(404);
  });

  it("403 when the customer's subscription was cancelled in the portal", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_real123", exp: Math.floor(Date.now() / 1000) + 900 },
      SIGNING_KEY,
    );
    const opts = baseOptions();
    (opts.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue(
      { status: "canceled" },
    );
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({ recoveryToken: token }),
      opts,
    );
    expect(res.status).toBe(403);
  });

  it("200 with a re-signed license token on success", async () => {
    const token = await signRecoveryToken(
      { customerId: "cus_real123", exp: Math.floor(Date.now() / 1000) + 900 },
      SIGNING_KEY,
    );
    const res = await handleIssueFromRecoveryRequest(
      makeRequest({ recoveryToken: token }),
      baseOptions(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.token).toMatch(/^fz_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(body.tier).toBe("personal");
  });
});
