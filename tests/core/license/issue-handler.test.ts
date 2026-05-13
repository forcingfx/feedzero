import { describe, it, expect, vi } from "vitest";
import {
  handleLicenseIssueRequest,
  SUPPORTED_METHODS,
} from "@/core/license/issue-handler";
import { LicenseIssuerImpl } from "@/core/license/issuer";
import { MemoryLicenseStorage, type LicenseStorage } from "@/core/license/storage";
import type { SigningKey } from "@/core/license/sign";
import { verifyLicense } from "@/core/license/verify";
import { err } from "@/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const ADMIN_KEY = "admin_test_key_with_enough_entropy_to_be_realistic_64ch";
const signingKey: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;

function buildIssuer() {
  const storage = new MemoryLicenseStorage();
  const issuer = new LicenseIssuerImpl({
    signingKey,
    storage,
    nowSec: () => NOW,
    generateKeyId: () => "kid_deterministic_for_test",
  });
  return { issuer, storage };
}

function postBody(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://feedzero.app/api/license/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("license issue handler — contract", () => {
  it("SUPPORTED_METHODS lists POST only", () => {
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });

  it("returns 405 for non-POST methods", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      new Request("https://feedzero.app/api/license/issue", { method: "GET" }),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(405);
  });
});

describe("license issue handler — auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody({ customerId: "cus_x", tier: "personal" }),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 401 when Authorization scheme is not Bearer", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: "Basic deadbeef" },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token does not match ADMIN_API_KEY", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: "Bearer wrong-token" },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_API_KEY is empty (refuses to mint with no auth configured)", async () => {
    // Fail-closed: if the operator has not configured an admin key,
    // refuse to mint rather than accept any token (which "" would do
    // under naive equality).
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: "Bearer anything" },
      ),
      { issuer, adminApiKey: "" },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/admin.*not configured/i);
  });

  it("does not leak the admin key in any response body", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: "Bearer wrong-token" },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    const text = await res.text();
    expect(text).not.toContain(ADMIN_KEY);
  });
});

describe("license issue handler — body validation", () => {
  it("returns 400 when body is not JSON", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      new Request("https://feedzero.app/api/license/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_KEY}`,
        },
        body: "not-json",
      }),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when customerId is missing", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody({ tier: "personal" }, { Authorization: `Bearer ${ADMIN_KEY}` }),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/customerId/i);
  });

  it("returns 400 when tier is missing", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody({ customerId: "cus_x" }, { Authorization: `Bearer ${ADMIN_KEY}` }),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tier/i);
  });

  it("returns 400 when tier is not 'personal' or 'pro'", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "platinum" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when customerId contains a colon (would corrupt token format)", async () => {
    // Defense in depth — encodeLicensePayload would throw, but we want to
    // catch this at the boundary with a clean 400 not a 500.
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus:bad", tier: "personal" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(400);
  });
});

describe("license issue handler — KILL_SIGNUPS", () => {
  it("returns 503 with 'signups disabled' when killSignups returns true (auth still verified first)", async () => {
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY, killSignups: () => true },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/signups disabled/i);
  });

  it("rejects unauthenticated requests with 401, not 503, even when killSignups=true", async () => {
    // Auth check runs FIRST so an attacker probing the kill switch must
    // first present a valid admin token. Mirrors the Stripe webhook
    // pattern (signature verified before KILL_SIGNUPS check).
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody({ customerId: "cus_x", tier: "personal" }),
      { issuer, adminApiKey: ADMIN_KEY, killSignups: () => true },
    );
    expect(res.status).toBe(401);
  });
});

describe("license issue handler — success path", () => {
  it("returns 200 with token + record for valid request", async () => {
    const { issuer, storage } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_test_123", tier: "pro" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token).toMatch(/^fz_/);
    expect(body.record).toMatchObject({
      customerId: "cus_test_123",
      tier: "pro",
      status: "active",
      keyId: "kid_deterministic_for_test",
    });

    // Persisted to storage
    const stored = await storage.get("kid_deterministic_for_test");
    expect(stored.ok && stored.value?.customerId).toBe("cus_test_123");
  });

  it("returned token verifies cleanly via the same signing key (round-trip)", async () => {
    // The integration value of this endpoint: the token we emit must be
    // accepted by /api/license/verify. Pin that contract here.
    const { issuer } = buildIssuer();
    const res = await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_roundtrip", tier: "personal" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    const body = await res.json();
    const verified = await verifyLicense(body.token, signingKey, { nowSec: NOW });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.customerId).toBe("cus_roundtrip");
      expect(verified.value.tier).toBe("personal");
    }
  });

  it("accepts optional subscriptionId and persists it on the record", async () => {
    const { issuer, storage } = buildIssuer();
    await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "pro", subscriptionId: "sub_xyz" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    const stored = await storage.get("kid_deterministic_for_test");
    expect(stored.ok && stored.value?.subscriptionId).toBe("sub_xyz");
  });

  it("uses default expiry (issuer default) when expirySec is not supplied", async () => {
    const { issuer, storage } = buildIssuer();
    await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal" },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    const stored = await storage.get("kid_deterministic_for_test");
    // Default expiry in LicenseIssuerImpl is 31 days from issuedAt
    expect(stored.ok && stored.value?.expirySec).toBe(NOW + 31 * 24 * 3600);
  });

  it("uses caller-supplied expirySec when provided", async () => {
    const { issuer, storage } = buildIssuer();
    const customExpiry = NOW + 7 * 24 * 3600;
    await handleLicenseIssueRequest(
      postBody(
        { customerId: "cus_x", tier: "personal", expirySec: customExpiry },
        { Authorization: `Bearer ${ADMIN_KEY}` },
      ),
      { issuer, adminApiKey: ADMIN_KEY },
    );
    const stored = await storage.get("kid_deterministic_for_test");
    expect(stored.ok && stored.value?.expirySec).toBe(customExpiry);
  });

  describe("observability — traceId + structured error logging", () => {
    function brokenStorage(): LicenseStorage {
      return {
        async put() { return err("storage down"); },
        async get() { return err("storage down"); },
        async listByCustomer() { return err("storage down"); },
        async revoke() { return err("storage down"); },
        async revokeAllForCustomer() { return err("storage down"); },
        async isRevoked() { return err("storage down"); },
      };
    }

    function buildBrokenIssuer() {
      return new LicenseIssuerImpl({
        signingKey,
        storage: brokenStorage(),
        nowSec: () => NOW,
        generateKeyId: () => "kid_deterministic_for_test",
      });
    }

    it("includes a traceId in 401 unauthorized response body", async () => {
      const { issuer } = buildIssuer();
      const res = await handleLicenseIssueRequest(
        postBody({ customerId: "cus_x", tier: "personal" }),
        { issuer, adminApiKey: ADMIN_KEY },
      );
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 503 not-configured response body", async () => {
      const { issuer } = buildIssuer();
      const res = await handleLicenseIssueRequest(
        postBody(
          { customerId: "cus_x", tier: "personal" },
          { Authorization: "Bearer anything" },
        ),
        { issuer, adminApiKey: "" }, // empty key → 503 not configured
      );
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 500 issue-failure response and writes a structured log", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const issuer = buildBrokenIssuer();
        const res = await handleLicenseIssueRequest(
          postBody(
            { customerId: "cus_x", tier: "personal" },
            { Authorization: `Bearer ${ADMIN_KEY}` },
          ),
          { issuer, adminApiKey: ADMIN_KEY },
        );
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/license/issue");
        expect(logged.method).toBe("POST");
        expect(logged.status).toBe(500);
        expect(logged.traceId).toBe(body.traceId);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT write a structured log on 4xx client errors (e.g. 401)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const { issuer } = buildIssuer();
        await handleLicenseIssueRequest(
          postBody({ customerId: "cus_x", tier: "personal" }),
          { issuer, adminApiKey: ADMIN_KEY },
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  it("does not log the wire token (handler is pure, no side channels)", async () => {
    // Sanity: the handler must not console.log the token. Simple check —
    // spy on console.log and assert no call mentions 'fz_'.
    const { issuer } = buildIssuer();
    const original = console.log;
    const calls: string[] = [];
    console.log = (...args: unknown[]) => calls.push(args.join(" "));
    try {
      await handleLicenseIssueRequest(
        postBody(
          { customerId: "cus_x", tier: "personal" },
          { Authorization: `Bearer ${ADMIN_KEY}` },
        ),
        { issuer, adminApiKey: ADMIN_KEY },
      );
    } finally {
      console.log = original;
    }
    expect(calls.some((c) => c.includes("fz_"))).toBe(false);
  });
});
