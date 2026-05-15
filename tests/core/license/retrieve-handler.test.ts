import { describe, it, expect, vi } from "vitest";
import {
  handleLicenseRetrieveRequest,
  SUPPORTED_METHODS,
  type SessionRetriever,
} from "@/core/license/retrieve-handler";
import { type SigningKey } from "@/core/license/sign";
import { verifyLicense } from "@/core/license/verify";
import {
  MemoryLicenseStorage,
  type LicenseRecord,
  type LicenseStorage,
} from "@/core/license/storage";
import { err } from "@/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const key: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;
const SESSION_ID = "cs_test_a1b2c3";
const CUSTOMER_ID = "cus_NQpJjB7ehjf2QH";

function fakeSessions(customer: string | null): SessionRetriever {
  return {
    retrieve: async () => ({ customer }),
  };
}

function brokenSessions(message: string): SessionRetriever {
  return {
    retrieve: async () => {
      throw new Error(message);
    },
  };
}

function postBody(body: unknown): Request {
  return new Request("https://feedzero.app/api/license/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function record(overrides: Partial<LicenseRecord>): LicenseRecord {
  return {
    keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    customerId: CUSTOMER_ID,
    subscriptionId: "sub_test_xyz",
    tier: "personal",
    status: "active",
    issuedAtSec: NOW - 60,
    expirySec: NOW + 31 * 24 * 3600,
    updatedAtSec: NOW - 60,
    ...overrides,
  };
}

describe("license retrieve handler", () => {
  it("SUPPORTED_METHODS lists POST only", () => {
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await handleLicenseRetrieveRequest(
      new Request("https://feedzero.app/api/license/retrieve", { method: "GET" }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(405);
  });

  it("returns 400 when body is not JSON", async () => {
    const res = await handleLicenseRetrieveRequest(
      new Request("https://feedzero.app/api/license/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
  });

  it("returns 400 when sessionId is missing or empty", async () => {
    const res = await handleLicenseRetrieveRequest(
      postBody({}),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sessionId/i);
  });

  it("returns 400 when sessionId shape is invalid (defends against URL/path injection)", async () => {
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: "cs_test_<script>" }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 when Stripe API throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await handleLicenseRetrieveRequest(
        postBody({ sessionId: SESSION_ID }),
        {
          sessions: brokenSessions("stripe network failure"),
          storage: new MemoryLicenseStorage(),
          signingKey: key,
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns 404 when Stripe session has no customer", async () => {
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(null),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/customer/i);
  });

  it("returns 202 pending when no records exist yet for the customer (webhook hasn't fired)", async () => {
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage: new MemoryLicenseStorage(),
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.pending).toBe(true);
  });

  it("returns 202 pending when all records are revoked", async () => {
    const storage = new MemoryLicenseStorage();
    await storage.put(record({}));
    await storage.revoke(record({}).keyId, "test cancellation");
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(202);
  });

  it("returns 202 pending when only expired records exist", async () => {
    const storage = new MemoryLicenseStorage();
    await storage.put(record({ expirySec: NOW - 10 }));
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(202);
  });

  it("returns 200 with a re-signed token when an active unrevoked unexpired record exists", async () => {
    const storage = new MemoryLicenseStorage();
    const r = record({});
    await storage.put(r);
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token.startsWith("fz_")).toBe(true);

    const decoded = await verifyLicense(body.token, key, { nowSec: NOW });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.customerId).toBe(CUSTOMER_ID);
      expect(decoded.value.keyId).toBe(r.keyId);
      expect(decoded.value.tier).toBe("personal");
    }
  });

  it("returns the most recently issued unrevoked unexpired record when multiple exist", async () => {
    const storage = new MemoryLicenseStorage();
    const older = record({
      keyId: "0000000000000000000000000000aaaa",
      issuedAtSec: NOW - 1000,
    });
    const newer = record({
      keyId: "1111111111111111111111111111bbbb",
      issuedAtSec: NOW - 60,
    });
    await storage.put(older);
    await storage.put(newer);
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const decoded = await verifyLicense(body.token, key, { nowSec: NOW });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.keyId).toBe(newer.keyId);
    }
  });

  it("returns the unrevoked record when both revoked and active exist", async () => {
    const storage = new MemoryLicenseStorage();
    const revoked = record({
      keyId: "0000000000000000000000000000aaaa",
      issuedAtSec: NOW - 60,
    });
    const active = record({
      keyId: "1111111111111111111111111111bbbb",
      issuedAtSec: NOW - 1000,
    });
    await storage.put(revoked);
    await storage.put(active);
    await storage.revoke(revoked.keyId, "cancelled then resubscribed");
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const decoded = await verifyLicense(body.token, key, { nowSec: NOW });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.keyId).toBe(active.keyId);
    }
  });

  it("returns 503 with traceId when storage errors out, and logs a structured server-error line", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const brokenStorage: LicenseStorage = {
        async put() { return err("storage down"); },
        async get() { return err("storage down"); },
        async listByCustomer() { return err("storage down"); },
        async revoke() { return err("storage down"); },
        async revokeAllForCustomer() { return err("storage down"); },
        async isRevoked() { return err("storage down"); },
      };
      const res = await handleLicenseRetrieveRequest(
        postBody({ sessionId: SESSION_ID }),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          storage: brokenStorage,
          signingKey: key,
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
      expect(logged.route).toBe("/api/license/retrieve");
      expect(logged.method).toBe("POST");
      expect(logged.status).toBe(503);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not leak the signing secret in any response", async () => {
    const storage = new MemoryLicenseStorage();
    await storage.put(record({}));
    const res = await handleLicenseRetrieveRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        storage,
        signingKey: key,
        nowSec: NOW,
      },
    );
    const text = await res.text();
    expect(text).not.toContain(SECRET);
  });
});
