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
      const response = await handleSyncRequest(makeGetRequest(vaultId), adapter);
      expect(response.status).toBe(404);
    });

    it("returns stored vault data", async () => {
      const vaultId = "b".repeat(64);
      const vaultJson = JSON.stringify({
        ok: true,
        vault: { version: 1, iv: [1, 2, 3], ciphertext: "abc" },
      });
      await adapter.put(vaultId, vaultJson);

      const response = await handleSyncRequest(makeGetRequest(vaultId), adapter);
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

  describe("unsupported method", () => {
    it("returns 405 for DELETE", async () => {
      const request = new Request("http://localhost/api/sync", {
        method: "DELETE",
      });
      const response = await handleSyncRequest(request, adapter);
      expect(response.status).toBe(405);
    });
  });
});
