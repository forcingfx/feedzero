import { describe, it, expect, vi } from "vitest";
import {
  handleLicenseVerifyRequest,
  SUPPORTED_METHODS,
} from "@/core/license/verify-handler";
import { signLicense, type SigningKey } from "@/core/license/sign";
import { MemoryLicenseStorage, type LicenseStorage } from "@/core/license/storage";
import type { LicensePayload } from "@/core/license/format";
import { err } from "@feedzero/core/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const key: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;

const validPayload: LicensePayload = {
  tier: "pro",
  expirySec: 1_800_000_000,
  customerId: "cus_NQpJjB7ehjf2QH",
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: 1_700_000_000,
};

function postBody(body: unknown): Request {
  return new Request("https://feedzero.app/api/license/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("license verify handler", () => {
  it("SUPPORTED_METHODS lists POST only", () => {
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });

  it("returns 405 for non-POST methods", async () => {
    const storage = new MemoryLicenseStorage();
    const res = await handleLicenseVerifyRequest(
      new Request("https://feedzero.app/api/license/verify", { method: "GET" }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(405);
  });

  it("returns 400 when body is not JSON", async () => {
    const storage = new MemoryLicenseStorage();
    const res = await handleLicenseVerifyRequest(
      new Request("https://feedzero.app/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 400 when token field is missing", async () => {
    const storage = new MemoryLicenseStorage();
    const res = await handleLicenseVerifyRequest(
      postBody({}),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/token/i);
  });

  it("returns 401 with 'invalid signature' for a tampered token", async () => {
    const storage = new MemoryLicenseStorage();
    const goodToken = await signLicense(validPayload, key);
    const [head, sig] = goodToken.split(".");
    const tampered = `${head}X.${sig}`;
    const res = await handleLicenseVerifyRequest(
      postBody({ token: tampered }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/signature/i);
  });

  it("returns 401 with 'expired' for an expired token", async () => {
    const storage = new MemoryLicenseStorage();
    const expired: LicensePayload = { ...validPayload, expirySec: NOW - 10 };
    const token = await signLicense(expired, key);
    const res = await handleLicenseVerifyRequest(
      postBody({ token }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 401 with 'revoked' when keyId is on the deny-list", async () => {
    const storage = new MemoryLicenseStorage();
    await storage.revoke(validPayload.keyId, "test");
    const token = await signLicense(validPayload, key);
    const res = await handleLicenseVerifyRequest(
      postBody({ token }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/revoked/i);
  });

  it("returns 200 with the verified payload for a valid token", async () => {
    const storage = new MemoryLicenseStorage();
    const token = await signLicense(validPayload, key);
    const res = await handleLicenseVerifyRequest(
      postBody({ token }),
      { signingKey: key, storage, nowSec: NOW },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.license).toEqual(validPayload);
  });

  it("does not leak the signing secret in any response", async () => {
    const storage = new MemoryLicenseStorage();
    const token = await signLicense(validPayload, key);
    const res = await handleLicenseVerifyRequest(
      postBody({ token }),
      { signingKey: key, storage, nowSec: NOW },
    );
    const text = await res.text();
    expect(text).not.toContain(SECRET);
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

    it("includes a traceId in 400 client-error response body", async () => {
      const storage = new MemoryLicenseStorage();
      const res = await handleLicenseVerifyRequest(
        new Request("https://feedzero.app/api/license/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
        { signingKey: key, storage, nowSec: NOW },
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 401 invalid-token response body", async () => {
      const storage = new MemoryLicenseStorage();
      const res = await handleLicenseVerifyRequest(
        postBody({ token: "not-a-real-token" }),
        { signingKey: key, storage, nowSec: NOW },
      );
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 503 storage-error response body and writes a structured log", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const token = await signLicense(validPayload, key);
        const res = await handleLicenseVerifyRequest(
          postBody({ token }),
          { signingKey: key, storage: brokenStorage(), nowSec: NOW },
        );
        const body = await res.json();
        expect(res.status).toBe(503);
        expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/license/verify");
        expect(logged.method).toBe("POST");
        expect(logged.status).toBe(503);
        expect(logged.traceId).toBe(body.traceId);
        expect(typeof logged.errClass).toBe("string");
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT write a structured log on 4xx client errors", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const storage = new MemoryLicenseStorage();
        await handleLicenseVerifyRequest(
          postBody({ token: "not-a-real-token" }),
          { signingKey: key, storage, nowSec: NOW },
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("emits a fresh traceId per request", async () => {
      const storage = new MemoryLicenseStorage();
      const r1 = await (await handleLicenseVerifyRequest(
        postBody({ token: "bad" }),
        { signingKey: key, storage, nowSec: NOW },
      )).json();
      const r2 = await (await handleLicenseVerifyRequest(
        postBody({ token: "bad" }),
        { signingKey: key, storage, nowSec: NOW },
      )).json();
      expect(r1.traceId).not.toBe(r2.traceId);
    });
  });
});
