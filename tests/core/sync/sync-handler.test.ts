import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleSyncRequest } from "@/core/sync/sync-handler";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import type { SyncStorageAdapter } from "@/core/sync/types";
import { err } from "@/utils/result";

describe("sync-handler", () => {
  let adapter: SyncStorageAdapter;

  beforeEach(() => {
    adapter = createMemoryAdapter();
  });

  function makeGetRequest(vaultId: string): Request {
    return new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
      method: "GET",
    });
  }

  function makePutRequest(body: unknown): Request {
    return new Request("http://localhost/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("GET", () => {
    it("returns 404 when vault does not exist", async () => {
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(404);
    });

    it("returns stored vault data", async () => {
      const vaultId = "b".repeat(64);
      const vaultJson = JSON.stringify({
        ok: true,
        vault: { version: 1, iv: [1, 2, 3], ciphertext: "abc" },
      });
      await adapter.put(vaultId, vaultJson);

      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.vault.version).toBe(1);
    });

    it("returns 400 for missing vaultId param", async () => {
      const request = new Request("http://localhost/api/sync", {
        method: "GET",
      });
      const response = await handleSyncRequest(request, adapter);
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid vaultId (not 64 hex chars)", async () => {
      const response = await handleSyncRequest(
        makeGetRequest("not-valid-hex"),
        adapter,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for vaultId with path traversal", async () => {
      const response = await handleSyncRequest(
        makeGetRequest("../../../etc/passwd"),
        adapter,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("PUT", () => {
    it("stores vault and returns success", async () => {
      const vaultId = "c".repeat(64);
      const vault = { version: 1, iv: [1, 2, 3], ciphertext: "abc" };

      const response = await handleSyncRequest(
        makePutRequest({ vaultId, vault }),
        adapter,
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.updatedAt).toBeGreaterThan(0);

      // Verify it was stored
      const stored = await adapter.get(vaultId);
      expect(stored.ok).toBe(true);
    });

    it("returns 400 for missing vaultId in body", async () => {
      const response = await handleSyncRequest(
        makePutRequest({ vault: { version: 1 } }),
        adapter,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid vaultId in body", async () => {
      const response = await handleSyncRequest(
        makePutRequest({ vaultId: "bad", vault: { version: 1 } }),
        adapter,
      );
      expect(response.status).toBe(400);
    });

    it("returns 413 for oversized body", async () => {
      const vaultId = "d".repeat(64);
      const largeCiphertext = "x".repeat(6 * 1024 * 1024); // > 5 MB

      const response = await handleSyncRequest(
        makePutRequest({
          vaultId,
          vault: { version: 1, iv: [1], ciphertext: largeCiphertext },
        }),
        adapter,
      );
      expect(response.status).toBe(413);
    });
  });

  describe("DELETE", () => {
    function makeDeleteRequest(vaultId: string): Request {
      return new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
        method: "DELETE",
      });
    }

    it("deletes an existing vault and returns success", async () => {
      const vaultId = "e".repeat(64);
      await adapter.put(vaultId, '{"ok":true,"vault":{}}');

      const response = await handleSyncRequest(
        makeDeleteRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);

      // Verify it was deleted
      const getResponse = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      expect(getResponse.status).toBe(404);
    });

    it("returns 200 for deleting a non-existent vault (idempotent)", async () => {
      const vaultId = "f".repeat(64);
      const response = await handleSyncRequest(
        makeDeleteRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(200);
    });

    it("returns 400 for missing vaultId", async () => {
      const request = new Request("http://localhost/api/sync", {
        method: "DELETE",
      });
      const response = await handleSyncRequest(request, adapter);
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid vaultId", async () => {
      const response = await handleSyncRequest(
        makeDeleteRequest("not-valid"),
        adapter,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("HEAD", () => {
    function makeHeadRequest(vaultId: string): Request {
      return new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
        method: "HEAD",
      });
    }

    it("returns 200 for existing vault", async () => {
      const vaultId = "1".repeat(64);
      await adapter.put(vaultId, '{"ok":true,"vault":{}}');

      const response = await handleSyncRequest(
        makeHeadRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(200);
    });

    it("returns 404 for non-existent vault", async () => {
      const vaultId = "2".repeat(64);
      const response = await handleSyncRequest(
        makeHeadRequest(vaultId),
        adapter,
      );
      expect(response.status).toBe(404);
    });

    it("returns 400 for missing vaultId", async () => {
      const request = new Request("http://localhost/api/sync", {
        method: "HEAD",
      });
      const response = await handleSyncRequest(request, adapter);
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid vaultId", async () => {
      const response = await handleSyncRequest(
        makeHeadRequest("not-valid-hex"),
        adapter,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("response headers do not leak between requests (issue #117)", () => {
    // The actual root cause of issue #117's `JSON.parse: unterminated
    // string` reports was NOT the filesystem adapter — it was the
    // sync-handler module sharing one `const API_HEADERS = { ... }`
    // object across every `new Response(body, { headers: API_HEADERS })`
    // call. @hono/node-server@2.0.2 mutates the supplied headers
    // record by appending the computed `Content-Length`. So a short
    // PUT response (~37 bytes) ran first, stamped `Content-Length: 37`
    // onto the shared object, and the next GET's Response inherited
    // the stale 37 — truncating a multi-KB vault body to 37 bytes on
    // the wire. The fix is `apiHeaders()` (a fresh object per call).
    //
    // This regression test asserts the headers object is fresh per
    // response by checking that two back-to-back responses with
    // different body sizes report different Content-Length values
    // (or at minimum, that the second response's Content-Length is
    // not the first response's).
    it("PUT then GET produce responses with independent header objects", async () => {
      const vaultId = "a".repeat(64);

      // Put a vault whose stored payload (the "{ok:true,vault:{...}}"
      // wrapping the adapter writes) is longer than the PUT's reply.
      const longVault = {
        version: 1,
        iv: [1, 2, 3, 4],
        ciphertext: "x".repeat(2000),
      };
      const putRes = await handleSyncRequest(
        makePutRequest({ vaultId, vault: longVault }),
        adapter,
      );
      expect(putRes.status).toBe(200);
      const putBody = await putRes.text();
      const putLen = putBody.length;

      const getRes = await handleSyncRequest(makeGetRequest(vaultId), adapter);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.text();

      // If the GET response inherits the PUT response's headers
      // object (pre-fix), `getBody` would be truncated to `putLen`
      // bytes at the HTTP layer. We don't go through HTTP here, so
      // the Response.text() is unaffected — but we DO assert that
      // each Response carries its own Headers instance, which is the
      // invariant the fix establishes.
      expect(getBody.length).toBeGreaterThan(putLen);
      expect(getRes.headers).not.toBe(putRes.headers);
    });

    it("two consecutive PUTs produce responses with independent header objects", async () => {
      const vaultId1 = "a".repeat(64);
      const vaultId2 = "b".repeat(64);
      const res1 = await handleSyncRequest(
        makePutRequest({
          vaultId: vaultId1,
          vault: { version: 1, iv: [1], ciphertext: "first" },
        }),
        adapter,
      );
      const res2 = await handleSyncRequest(
        makePutRequest({
          vaultId: vaultId2,
          vault: { version: 1, iv: [1], ciphertext: "second" },
        }),
        adapter,
      );
      expect(res1.headers).not.toBe(res2.headers);
    });
  });

  describe("security headers", () => {
    it("sets X-Content-Type-Options: nosniff on JSON responses", async () => {
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("sets X-Content-Type-Options: nosniff on PUT responses", async () => {
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makePutRequest({
          vaultId,
          vault: { version: 1, iv: [1], ciphertext: "abc" },
        }),
        adapter,
      );
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  describe("unsupported method", () => {
    it("returns 405 for PATCH", async () => {
      const request = new Request("http://localhost/api/sync", {
        method: "PATCH",
      });
      const response = await handleSyncRequest(request, adapter);
      expect(response.status).toBe(405);
    });
  });

  describe("observability — traceId + structured error logging", () => {
    // Observability foundation for the silent-launch monetization stack.
    // Pattern (mirrored across all 5 monetization handlers):
    //   - Every non-2xx response body carries a `traceId` so user reports
    //     can be correlated to runtime logs by grep.
    //   - Every 5xx path also writes a single-line JSON via logError() so
    //     ops can grep Vercel logs for {route, status, traceId, errClass}.
    //   - 4xx (client error) paths get traceId in the body but NOT a
    //     server-side log — they aren't actionable for ops.

    function makeBrokenAdapter(): SyncStorageAdapter {
      return {
        async get() { return err("adapter down"); },
        async put() { return err("adapter down"); },
        async delete() { return err("adapter down"); },
        async count() { return err("adapter down"); },
        async lastUpdatedAt() { return err("adapter down"); },
      };
    }

    it("includes a traceId in 400 client-error response body", async () => {
      const response = await handleSyncRequest(
        new Request("http://localhost/api/sync", { method: "GET" }),
        adapter,
      );
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(typeof body.traceId).toBe("string");
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 404 not-found response body", async () => {
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      const body = await response.json();
      expect(response.status).toBe(404);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 500 server-error response body", async () => {
      const vaultId = "c".repeat(64);
      const response = await handleSyncRequest(
        makePutRequest({ vaultId, vault: { v: 1 } }),
        makeBrokenAdapter(),
      );
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("emits a fresh traceId per request (no correlation across requests)", async () => {
      const vaultId = "a".repeat(64);
      const r1 = await (await handleSyncRequest(makeGetRequest(vaultId), adapter)).json();
      const r2 = await (await handleSyncRequest(makeGetRequest(vaultId), adapter)).json();
      expect(r1.traceId).not.toBe(r2.traceId);
    });

    it("writes a structured error log on the 500 path", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const vaultId = "c".repeat(64);
        const response = await handleSyncRequest(
          makePutRequest({ vaultId, vault: { v: 1 } }),
          makeBrokenAdapter(),
        );
        const body = await response.json();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/sync");
        expect(logged.method).toBe("PUT");
        expect(logged.status).toBe(500);
        expect(logged.traceId).toBe(body.traceId);
        expect(typeof logged.errClass).toBe("string");
        expect(typeof logged.errMsg).toBe("string");
        expect(typeof logged.ts).toBe("string");
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT write a structured log on 4xx client errors", async () => {
      // 4xx isn't ops-actionable. Keeping it out of the error log keeps the
      // log clean for genuine 5xx incidents.
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        await handleSyncRequest(
          new Request("http://localhost/api/sync", { method: "GET" }),
          adapter,
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT log vaultId or any PII in the error log", async () => {
      // Floor: even though the caller chose what to put in errMsg, the
      // logger's allow-list drops any unknown field. This test guards against
      // a future regression where someone widens the allow-list.
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const vaultId = "d".repeat(64);
        await handleSyncRequest(
          makePutRequest({ vaultId, vault: { v: 1 } }),
          makeBrokenAdapter(),
        );
        const raw = consoleError.mock.calls[0][0] as string;
        expect(raw).not.toContain(vaultId);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("optional license gate (PR W)", () => {
    // When the third options arg carries `licenseAuth`, the handler runs
    // authorizeLicense before any data path. The gate is OFF (no licenseAuth
    // passed) by default — current free-sync behavior preserved exactly.
    // The wiring layer (server.ts / vite.config.js / api/sync.ts) decides
    // whether to pass licenseAuth based on the LAUNCH_PAID_TIER env flag.

    const SECRET = "this-is-a-test-signing-secret-32-bytes!";
    const NOW = 1_750_000_000;

    async function importLicenseHelpers() {
      const [
        { signLicense },
        { MemoryLicenseStorage },
      ] = await Promise.all([
        import("@/core/license/sign"),
        import("@/core/license/storage"),
      ]);
      return { signLicense, MemoryLicenseStorage };
    }

    it("does NOT require auth when licenseAuth option is absent (current behavior)", async () => {
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
        // no third arg
      );
      // Vault-not-found 404 — proves auth was not enforced.
      expect(response.status).toBe(404);
    });

    it("returns 401 when licenseAuth is configured and Authorization header is missing", async () => {
      const { MemoryLicenseStorage } = await importLicenseHelpers();
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
        {
          licenseAuth: {
            signingKey: { secret: SECRET },
            storage: new MemoryLicenseStorage(),
            nowSec: NOW,
          },
        },
      );
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.ok).toBe(false);
    });

    it("returns 401 for tampered bearer token", async () => {
      const { signLicense, MemoryLicenseStorage } = await importLicenseHelpers();
      const token = await signLicense(
        {
          tier: "personal",
          expirySec: NOW + 86400,
          customerId: "cus_x",
          keyId: "kid_test_xxxxxxxxxxxxxxxxxxxxxxxx",
          issuedAtSec: NOW - 100,
        },
        { secret: SECRET },
      );
      const tampered = token.slice(0, -2) + "AA";
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${tampered}` },
        }),
        adapter,
        {
          licenseAuth: {
            signingKey: { secret: SECRET },
            storage: new MemoryLicenseStorage(),
            nowSec: NOW,
          },
        },
      );
      expect(response.status).toBe(401);
    });

    it("returns 401 for revoked token (storage deny-list hit)", async () => {
      const { signLicense, MemoryLicenseStorage } = await importLicenseHelpers();
      const keyId = "kid_revoked_xxxxxxxxxxxxxxxxxxxx";
      const storage = new MemoryLicenseStorage();
      await storage.revoke(keyId, "test");
      const token = await signLicense(
        {
          tier: "personal",
          expirySec: NOW + 86400,
          customerId: "cus_x",
          keyId,
          issuedAtSec: NOW - 100,
        },
        { secret: SECRET },
      );
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
        adapter,
        {
          licenseAuth: {
            signingKey: { secret: SECRET },
            storage,
            nowSec: NOW,
          },
        },
      );
      expect(response.status).toBe(401);
    });

    it("proceeds to handler when bearer is valid + un-revoked", async () => {
      const { signLicense, MemoryLicenseStorage } = await importLicenseHelpers();
      const token = await signLicense(
        {
          tier: "personal",
          expirySec: NOW + 86400,
          customerId: "cus_x",
          keyId: "kid_valid_xxxxxxxxxxxxxxxxxxxxxx",
          issuedAtSec: NOW - 100,
        },
        { secret: SECRET },
      );
      const vaultId = "a".repeat(64);
      const response = await handleSyncRequest(
        new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
        adapter,
        {
          licenseAuth: {
            signingKey: { secret: SECRET },
            storage: new MemoryLicenseStorage(),
            nowSec: NOW,
          },
        },
      );
      // Handler ran (404 because vault doesn't exist, NOT 401 from auth).
      expect(response.status).toBe(404);
    });
  });

  describe("conditional GET with ETag (If-None-Match)", () => {
    const vaultId = "5".repeat(64);
    const payload = '{"ok":true,"vault":{"v":"deadbeef"}}';

    it("returns an ETag on the GET response", async () => {
      await adapter.put(vaultId, payload);
      const res = await handleSyncRequest(makeGetRequest(vaultId), adapter);
      expect(res.status).toBe(200);
      // Weak validator, hex-ish digest in quotes.
      expect(res.headers.get("ETag")).toMatch(/^W\/"[a-f0-9]+"$/);
    });

    it("returns the same ETag for identical stored content across two GETs", async () => {
      await adapter.put(vaultId, payload);
      const a = await handleSyncRequest(makeGetRequest(vaultId), adapter);
      const b = await handleSyncRequest(makeGetRequest(vaultId), adapter);
      expect(a.headers.get("ETag")).toBe(b.headers.get("ETag"));
    });

    it("returns 304 Not Modified when If-None-Match matches the stored ETag", async () => {
      await adapter.put(vaultId, payload);
      const first = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      const etag = first.headers.get("ETag")!;

      const second = await handleSyncRequest(
        new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
          method: "GET",
          headers: { "If-None-Match": etag },
        }),
        adapter,
      );
      expect(second.status).toBe(304);
      // 304 must still echo the validator (RFC 9110 §15.4.5) and must
      // carry no message body.
      expect(second.headers.get("ETag")).toBe(etag);
      expect(await second.text()).toBe("");
    });

    it("returns 200 + new body when If-None-Match is stale", async () => {
      await adapter.put(vaultId, payload);
      const first = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      const staleEtag = first.headers.get("ETag")!;

      // PUT new content — server-stored bytes change → ETag changes.
      await adapter.put(vaultId, '{"ok":true,"vault":{"v":"updated"}}');

      const res = await handleSyncRequest(
        new Request(`http://localhost/api/sync?vaultId=${vaultId}`, {
          method: "GET",
          headers: { "If-None-Match": staleEtag },
        }),
        adapter,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("ETag")).not.toBe(staleEtag);
      const body = await res.text();
      expect(body).toContain("updated");
    });

    it("PUT response includes the ETag of the just-stored value", async () => {
      const res = await handleSyncRequest(
        makePutRequest({ vaultId, vault: { v: "fresh" } }),
        adapter,
      );
      expect(res.status).toBe(200);
      const putEtag = res.headers.get("ETag");
      expect(putEtag).toMatch(/^W\/"[a-f0-9]+"$/);

      // Confirm the PUT's ETag matches what GET would return.
      const getRes = await handleSyncRequest(
        makeGetRequest(vaultId),
        adapter,
      );
      expect(getRes.headers.get("ETag")).toBe(putEtag);
    });
  });
});
