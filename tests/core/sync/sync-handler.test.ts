import { describe, it, expect, beforeEach } from "vitest";
import { handleSyncRequest } from "@/core/sync/sync-handler";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import type { SyncStorageAdapter } from "@/core/sync/types";

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
});
