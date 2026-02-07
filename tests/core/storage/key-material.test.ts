import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  deriveAndStoreKeys,
  loadStoredKeys,
  clearStoredKeys,
} from "../../../src/core/storage/key-material.ts";
import type { StoredKeyMaterial } from "../../../src/core/storage/key-material.ts";

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

const STORAGE_KEY = "feedzero:derived-keys";
const TEST_PASSPHRASE = "carbon mango velvet prism";

describe("key-material", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("deriveAndStoreKeys", () => {
    it("derives DB key and HMAC key from passphrase", async () => {
      const result = await deriveAndStoreKeys(TEST_PASSPHRASE);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.dbKeyJwk).toBeDefined();
      expect(result.value.dbKeyJwk.kty).toBe("oct");
      expect(result.value.hmacKeyJwk).toBeDefined();
      expect(result.value.hmacKeyJwk.kty).toBe("oct");
    });

    it("stores salt as array of numbers", async () => {
      const result = await deriveAndStoreKeys(TEST_PASSPHRASE);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Array.isArray(result.value.dbSalt)).toBe(true);
      expect(result.value.dbSalt.length).toBeGreaterThan(0);
      expect(result.value.dbSalt.every((n) => typeof n === "number")).toBe(true);
    });

    it("persists key material to localStorage", async () => {
      await deriveAndStoreKeys(TEST_PASSPHRASE);

      const stored = localStorageMock.getItem(STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!) as StoredKeyMaterial;
      expect(parsed.dbKeyJwk).toBeDefined();
      expect(parsed.hmacKeyJwk).toBeDefined();
      expect(parsed.dbSalt).toBeDefined();
    });

    it("does not include vault keys by default", async () => {
      const result = await deriveAndStoreKeys(TEST_PASSPHRASE);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.vaultId).toBeUndefined();
      expect(result.value.vaultKeyJwk).toBeUndefined();
    });

    it("includes vault keys when includeVaultKeys option is set", async () => {
      const result = await deriveAndStoreKeys(TEST_PASSPHRASE, undefined, {
        includeVaultKeys: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.vaultId).toBeDefined();
      expect(typeof result.value.vaultId).toBe("string");
      expect(result.value.vaultKeyJwk).toBeDefined();
      expect(result.value.vaultKeyJwk!.kty).toBe("oct");
    });

    it("reuses provided salt instead of generating new one", async () => {
      const salt = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
      const result = await deriveAndStoreKeys(TEST_PASSPHRASE, salt);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.dbSalt).toEqual(Array.from(salt));
    });

    it("produces deterministic output for same passphrase and salt", async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const result1 = await deriveAndStoreKeys(TEST_PASSPHRASE, salt);
      const result2 = await deriveAndStoreKeys(TEST_PASSPHRASE, salt);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;
      expect(result1.value.dbKeyJwk.k).toBe(result2.value.dbKeyJwk.k);
      expect(result1.value.hmacKeyJwk.k).toBe(result2.value.hmacKeyJwk.k);
    });

    it("produces different DB keys for different passphrases", async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const result1 = await deriveAndStoreKeys("alpha bravo charlie delta", salt);
      const result2 = await deriveAndStoreKeys("echo foxtrot golf hotel", salt);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;
      expect(result1.value.dbKeyJwk.k).not.toBe(result2.value.dbKeyJwk.k);
    });
  });

  describe("loadStoredKeys", () => {
    it("returns null when no keys are stored", () => {
      expect(loadStoredKeys()).toBeNull();
    });

    it("returns parsed key material from localStorage", async () => {
      await deriveAndStoreKeys(TEST_PASSPHRASE);

      const loaded = loadStoredKeys();
      expect(loaded).not.toBeNull();
      expect(loaded!.dbKeyJwk).toBeDefined();
      expect(loaded!.hmacKeyJwk).toBeDefined();
      expect(loaded!.dbSalt).toBeDefined();
    });

    it("returns null for corrupted localStorage data", () => {
      localStorageMock.setItem(STORAGE_KEY, "not-valid-json{{{");

      expect(loadStoredKeys()).toBeNull();
    });
  });

  describe("clearStoredKeys", () => {
    it("removes key material from localStorage", async () => {
      await deriveAndStoreKeys(TEST_PASSPHRASE);
      expect(loadStoredKeys()).not.toBeNull();

      clearStoredKeys();

      expect(loadStoredKeys()).toBeNull();
    });

    it("does not error when no keys are stored", () => {
      expect(() => clearStoredKeys()).not.toThrow();
    });
  });
});
