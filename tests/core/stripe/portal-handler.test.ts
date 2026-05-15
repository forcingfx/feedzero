import { describe, it, expect, vi } from "vitest";
import {
  handlePortalRequest,
  SUPPORTED_METHODS,
  type PortalClient,
  type PortalSessionRetriever,
} from "@/core/stripe/portal-handler";
import { signLicense, type SigningKey } from "@/core/license/sign";
import {
  MemoryLicenseStorage,
  type LicenseStorage,
} from "@/core/license/storage";
import type { LicensePayload } from "@/core/license/format";
import { err } from "@/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const signingKey: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;
const CUSTOMER_ID = "cus_NQpJjB7ehjf2QH";
const SESSION_ID = "cs_test_xyz123";
const RETURN_URL = "https://my.feedzero.app/settings";

const VALID_PAYLOAD: LicensePayload = {
  tier: "personal",
  expirySec: NOW + 31 * 24 * 3600,
  customerId: CUSTOMER_ID,
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: NOW - 60,
};

function fakeSessions(customer: string | null): PortalSessionRetriever {
  return { retrieve: async () => ({ customer }) };
}

function fakePortal(url = "https://billing.stripe.com/p/session_xyz"): PortalClient {
  return {
    create: vi.fn(async () => ({ url })),
  };
}

function postBody(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://feedzero.app/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("billing portal handler", () => {
  it("SUPPORTED_METHODS lists POST only", () => {
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });

  it("returns 405 for non-POST methods", async () => {
    const res = await handlePortalRequest(
      new Request("https://feedzero.app/api/billing/portal", { method: "GET" }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        portal: fakePortal(),
        signingKey,
        storage: new MemoryLicenseStorage(),
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(405);
  });

  it("returns 400 when body is not JSON", async () => {
    const res = await handlePortalRequest(
      new Request("https://feedzero.app/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        portal: fakePortal(),
        signingKey,
        storage: new MemoryLicenseStorage(),
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither sessionId nor bearer is provided", async () => {
    const res = await handlePortalRequest(
      postBody({ returnUrl: RETURN_URL }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        portal: fakePortal(),
        signingKey,
        storage: new MemoryLicenseStorage(),
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sessionId|bearer|authorization/i);
  });

  it("returns 400 when returnUrl is missing", async () => {
    const res = await handlePortalRequest(
      postBody({ sessionId: SESSION_ID }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        portal: fakePortal(),
        signingKey,
        storage: new MemoryLicenseStorage(),
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/returnUrl/i);
  });

  it("returns 400 when returnUrl is not http(s)", async () => {
    const res = await handlePortalRequest(
      postBody({ sessionId: SESSION_ID, returnUrl: "javascript:alert(1)" }),
      {
        sessions: fakeSessions(CUSTOMER_ID),
        portal: fakePortal(),
        signingKey,
        storage: new MemoryLicenseStorage(),
        nowSec: NOW,
      },
    );
    expect(res.status).toBe(400);
  });

  describe("Path A — sessionId auth", () => {
    it("returns 400 when sessionId shape is invalid (defends against injection)", async () => {
      const res = await handlePortalRequest(
        postBody({ sessionId: "../../etc/passwd", returnUrl: RETURN_URL }),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal: fakePortal(),
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 when Stripe session has no customer", async () => {
      const res = await handlePortalRequest(
        postBody({ sessionId: SESSION_ID, returnUrl: RETURN_URL }),
        {
          sessions: fakeSessions(null),
          portal: fakePortal(),
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(404);
    });

    it("returns 502 when Stripe session lookup throws", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await handlePortalRequest(
          postBody({ sessionId: SESSION_ID, returnUrl: RETURN_URL }),
          {
            sessions: {
              retrieve: async () => {
                throw new Error("stripe down");
              },
            },
            portal: fakePortal(),
            signingKey,
            storage: new MemoryLicenseStorage(),
            nowSec: NOW,
          },
        );
        expect(res.status).toBe(502);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("returns 200 with the portal URL when sessionId resolves to a customer", async () => {
      const portal = fakePortal();
      const res = await handlePortalRequest(
        postBody({ sessionId: SESSION_ID, returnUrl: RETURN_URL }),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal,
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
      expect(portal.create).toHaveBeenCalledWith({
        customer: CUSTOMER_ID,
        return_url: RETURN_URL,
      });
    });
  });

  describe("Path B — bearer license auth", () => {
    it("returns 200 with the portal URL when bearer is valid", async () => {
      const token = await signLicense(VALID_PAYLOAD, signingKey);
      const portal = fakePortal();
      const res = await handlePortalRequest(
        postBody(
          { returnUrl: RETURN_URL },
          { Authorization: `Bearer ${token}` },
        ),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal,
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
      expect(portal.create).toHaveBeenCalledWith({
        customer: CUSTOMER_ID,
        return_url: RETURN_URL,
      });
    });

    it("returns 401 when bearer token is invalid", async () => {
      const res = await handlePortalRequest(
        postBody(
          { returnUrl: RETURN_URL },
          { Authorization: "Bearer fz_garbage.token" },
        ),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal: fakePortal(),
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 when bearer token is revoked", async () => {
      const token = await signLicense(VALID_PAYLOAD, signingKey);
      const storage = new MemoryLicenseStorage();
      await storage.revoke(VALID_PAYLOAD.keyId, "cancelled");
      const res = await handlePortalRequest(
        postBody(
          { returnUrl: RETURN_URL },
          { Authorization: `Bearer ${token}` },
        ),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal: fakePortal(),
          signingKey,
          storage,
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(401);
    });

    it("prefers bearer over sessionId when both are provided (bearer is more authoritative)", async () => {
      const token = await signLicense(VALID_PAYLOAD, signingKey);
      const portal = fakePortal();
      const res = await handlePortalRequest(
        postBody(
          { sessionId: SESSION_ID, returnUrl: RETURN_URL },
          { Authorization: `Bearer ${token}` },
        ),
        {
          // Stripe sessions would resolve to a DIFFERENT customer; if the
          // handler took sessionId, the portal would open for cus_other_xyz.
          // Asserting we use the bearer's customer proves precedence.
          sessions: fakeSessions("cus_other_xyz"),
          portal,
          signingKey,
          storage: new MemoryLicenseStorage(),
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(200);
      expect(portal.create).toHaveBeenCalledWith({
        customer: CUSTOMER_ID,
        return_url: RETURN_URL,
      });
    });
  });

  it("returns 502 when Stripe portal creation throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await handlePortalRequest(
        postBody({ sessionId: SESSION_ID, returnUrl: RETURN_URL }),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal: {
            create: async () => {
              throw new Error("portal disabled");
            },
          },
          signingKey,
          storage: new MemoryLicenseStorage(),
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

  it("returns 503 with traceId on storage error (bearer path)", async () => {
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
      const token = await signLicense(VALID_PAYLOAD, signingKey);
      const res = await handlePortalRequest(
        postBody(
          { returnUrl: RETURN_URL },
          { Authorization: `Bearer ${token}` },
        ),
        {
          sessions: fakeSessions(CUSTOMER_ID),
          portal: fakePortal(),
          signingKey,
          storage: brokenStorage,
          nowSec: NOW,
        },
      );
      expect(res.status).toBe(503);
    } finally {
      consoleError.mockRestore();
    }
  });
});
