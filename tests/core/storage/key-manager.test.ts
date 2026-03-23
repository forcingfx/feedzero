import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("@/core/sync/sync-service", () => ({
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

import { initFresh } from "@/core/storage/key-manager";
import { close } from "@/core/storage/db";
import { deleteVault } from "@/core/sync/sync-service";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("key-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  describe("initFresh with skipServerCleanup", () => {
    it("does not attempt to delete server vault when skipServerCleanup is true", async () => {
      // Simulate stored vault keys from a previous session
      localStorageMock.setItem(
        "feedzero:derived-keys",
        JSON.stringify({
          dbKeyJwk: {},
          hmacKeyJwk: {},
          dbSalt: [1, 2, 3],
          vaultId: "previous-vault-id",
          vaultKeyJwk: { kty: "oct", k: "test" },
        }),
      );

      await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });

      expect(deleteVault).not.toHaveBeenCalled();
    });

    it("returns ok with sync credentials when sync is enabled", async () => {
      const result = await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentials).not.toBeNull();
        expect(result.value.credentials?.vaultId).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });
});
