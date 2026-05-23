import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";

// Every test in this file does at least one real PBKDF2 derivation via
// initFresh / restore / persistDerivedKeysFromOpenDb. happy-dom's Web Crypto
// is CPU-bound and contended under parallel test workers, so individual
// tests can exceed the 5s default. Bumping the file-level timeout absorbs
// the variance without changing what we test. Issue surfaced when the
// pre-push hook hit `key-manager > persistDerivedKeysFromOpenDb > re-derives
// keys + vault material for a sync session` timing out at 5015ms on a
// parallel run while passing in 3.4s in isolation.
vi.setConfig({ testTimeout: 15_000 });

vi.mock("@/core/sync/sync-service", () => ({
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

import {
  initFresh,
  restore,
  addVaultKeys,
  removeVaultKeys,
  destroy,
  destroyLocal,
  persistDerivedKeysFromOpenDb,
} from "@/core/storage/key-manager";
import { close } from "@/core/storage/db";
import { deleteVault } from "@/core/sync/sync-service";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";

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

  describe("initFresh", () => {
    it("does not attempt to delete server vault when skipServerCleanup is true", async () => {
      localStorageMock.setItem(
        LOCAL_STORAGE.DERIVED_KEYS,
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

    it("returns sync credentials with hex vaultId when sync is enabled", async () => {
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

    it("returns null credentials and persists local storage mode for local-only init", async () => {
      const result = await initFresh("test passphrase here now", {
        sync: false,
        skipServerCleanup: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentials).toBeNull();
      }
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBe("local");
      expect(localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)).not.toBeNull();
    });

    it(
      "attempts to delete previous server vault when skipServerCleanup is false and stored vault keys exist",
      async () => {
        // Run a real sync init first so stored vault keys are valid JWK,
        // then a second init without skipServerCleanup should trigger deleteVault.
        //
        // Two real `initFresh({ sync: true })` calls means four real PBKDF2
        // derivations end-to-end (~2.5s each on slow CI), which crosses
        // Vitest's 5s default and produced the 2026-05-19 pre-push flake.
        // The seeding-via-real-init is intentional (it locks down the
        // localStorage shape contract), so the right fix is to give the
        // crypto room to run, not to swap in a hand-rolled JWK fixture.
        await initFresh("first passphrase here now", {
          sync: true,
          skipServerCleanup: true,
        });
        vi.mocked(deleteVault).mockClear();

        await initFresh("second passphrase here now", { sync: true });
        expect(deleteVault).toHaveBeenCalledOnce();
      },
      15000,
    );

    it("does not call deleteVault when no previous vault keys exist", async () => {
      // No stored keys at all
      await initFresh("brand new passphrase", { sync: true });
      expect(deleteVault).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("returns no-keys when localStorage has nothing", async () => {
      const status = await restore();
      expect(status.status).toBe("no-keys");
    });

    it("returns invalid-keys when stored JSON cannot decrypt the database", async () => {
      // Plant garbage that parses as JSON but fails as JWK
      localStorageMock.setItem(
        LOCAL_STORAGE.DERIVED_KEYS,
        JSON.stringify({
          dbKeyJwk: { kty: "oct", k: "AAAAAAAAAAAAAAAAAAAAAA" },
          hmacKeyJwk: { kty: "oct", k: "AAAAAAAAAAAAAAAAAAAAAA" },
          dbSalt: [1, 2, 3],
        }),
      );

      const status = await restore();
      expect(status.status).toBe("invalid-keys");
    });

    it("returns no-keys when stored JSON is malformed", async () => {
      localStorageMock.setItem(LOCAL_STORAGE.DERIVED_KEYS, "{not json");
      const status = await restore();
      expect(status.status).toBe("no-keys");
    });

    it("returns ready with credentials=null after a fresh local init", async () => {
      const init = await initFresh("test passphrase here now", {
        sync: false,
        skipServerCleanup: true,
      });
      expect(init.ok).toBe(true);
      close();

      const status = await restore();
      expect(status.status).toBe("ready");
      if (status.status === "ready") {
        expect(status.isSyncUser).toBe(false);
        expect(status.credentials).toBeNull();
      }
    });

    it("returns ready with credentials after a fresh sync init", async () => {
      const init = await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });
      expect(init.ok).toBe(true);
      close();

      const status = await restore();
      expect(status.status).toBe("ready");
      if (status.status === "ready") {
        expect(status.isSyncUser).toBe(true);
        expect(status.credentials).not.toBeNull();
        expect(status.credentials?.vaultId).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  describe("addVaultKeys", () => {
    it("returns err when there are no stored keys", async () => {
      const result = await addVaultKeys("any passphrase");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/No stored keys/);
      }
    });

    it("derives + persists vault keys on top of an existing local session", async () => {
      // Local-only init first
      await initFresh("local passphrase here now", {
        sync: false,
        skipServerCleanup: true,
      });
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBe("local");

      const result = await addVaultKeys("local passphrase here now");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.vaultId).toMatch(/^[0-9a-f]{64}$/);
      }
      // Storage mode should now be sync
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBe("sync");

      // Stored material should now contain vaultId + vaultKeyJwk
      const raw = localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!);
      expect(stored.vaultId).toBeDefined();
      expect(stored.vaultKeyJwk).toBeDefined();
    });
  });

  describe("removeVaultKeys", () => {
    it("is a no-op when there are no stored keys", () => {
      expect(() => removeVaultKeys()).not.toThrow();
      expect(localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)).toBeNull();
    });

    it("strips vaultId/vaultKeyJwk while preserving DB keys", async () => {
      await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });
      // Pre-condition: stored material has vault fields
      const before = JSON.parse(
        localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)!,
      );
      expect(before.vaultId).toBeDefined();

      removeVaultKeys();

      const after = JSON.parse(
        localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)!,
      );
      expect(after.vaultId).toBeUndefined();
      expect(after.vaultKeyJwk).toBeUndefined();
      expect(after.dbKeyJwk).toEqual(before.dbKeyJwk);
      expect(after.hmacKeyJwk).toEqual(before.hmacKeyJwk);
      // Storage mode flag cleared
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBeNull();
    });
  });

  describe("destroy and destroyLocal", () => {
    it("destroyLocal clears local storage but leaves the server vault alone", async () => {
      await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });
      expect(localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)).not.toBeNull();

      await destroyLocal();
      expect(deleteVault).not.toHaveBeenCalled();
      expect(localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)).toBeNull();
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBeNull();
      expect(localStorageMock.getItem(LOCAL_STORAGE.ONBOARDING_COMPLETE)).toBeNull();
    });

    it("destroy clears local storage AND attempts server vault deletion", async () => {
      await initFresh("test passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });

      await destroy();
      expect(deleteVault).toHaveBeenCalledOnce();
      expect(localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)).toBeNull();
    });
  });

  describe("persistDerivedKeysFromOpenDb", () => {
    it("re-derives keys for a local session", async () => {
      // Bootstrap a DB so getSalt() has something to read
      await initFresh("first passphrase here now", {
        sync: false,
        skipServerCleanup: true,
      });

      const result = await persistDerivedKeysFromOpenDb("first passphrase here now", {
        sync: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentials).toBeNull();
      }
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBe("local");
    });

    it("re-derives keys + vault material for a sync session", async () => {
      await initFresh("first passphrase here now", {
        sync: true,
        skipServerCleanup: true,
      });

      const result = await persistDerivedKeysFromOpenDb("first passphrase here now", {
        sync: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentials).not.toBeNull();
        expect(result.value.credentials?.vaultId).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(localStorageMock.getItem(LOCAL_STORAGE.STORAGE_MODE)).toBe("sync");

      const stored = JSON.parse(
        localStorageMock.getItem(LOCAL_STORAGE.DERIVED_KEYS)!,
      );
      expect(stored.vaultId).toBeDefined();
      expect(stored.vaultKeyJwk).toBeDefined();
    });
  });
});
