import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "../../src/stores/app-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  open: vi.fn(),
  openWithKeys: vi.fn(),
  deleteDatabase: vi.fn(),
  getFeeds: vi.fn(),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("../../src/core/storage/key-material", () => ({
  loadStoredKeys: vi.fn().mockReturnValue(null),
  deriveAndStoreKeys: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      dbKeyJwk: { kty: "oct" },
      hmacKeyJwk: { kty: "oct" },
      dbSalt: [1, 2, 3],
      vaultId: "migrated-vault-id",
      vaultKeyJwk: { kty: "oct", key_ops: ["encrypt", "decrypt"] },
    },
  }),
  clearStoredKeys: vi.fn(),
}));

vi.mock("../../src/core/storage/crypto.ts", () => ({
  importCryptoKey: vi.fn().mockResolvedValue("mock-vault-key"),
}));

import { open, openWithKeys, getFeeds } from "../../src/core/storage/db.ts";
import { pullVault, importVault } from "../../src/core/sync/sync-service";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { loadStoredKeys } from "../../src/core/storage/key-material";

const ONBOARDING_KEY = "feedzero:onboarding-complete";

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

describe("app-store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("starts with db not ready and no error", () => {
    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(false);
    expect(state.error).toBeNull();
  });

  it("initialize sets isDbReady on success", async () => {
    vi.mocked(open).mockResolvedValue({ ok: true, value: true });

    await useAppStore.getState().initialize("test-key");

    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(true);
    expect(state.error).toBeNull();
    expect(open).toHaveBeenCalledWith("test-key");
  });

  it("initialize sets error on failure", async () => {
    vi.mocked(open).mockResolvedValue({ ok: false, error: "DB failed" });

    await useAppStore.getState().initialize("test-key");

    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(false);
    expect(state.error).toBe("DB failed");
  });

  it("setError updates error state", () => {
    useAppStore.getState().setError("something broke");
    expect(useAppStore.getState().error).toBe("something broke");

    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });

  describe("onboarding completion", () => {
    it("hasCompletedOnboarding defaults to false when localStorage empty", () => {
      localStorageMock.clear();
      const state = useAppStore.getState();
      expect(state.hasCompletedOnboarding).toBe(false);
    });

    it("completeOnboarding sets flag in state", () => {
      useAppStore.getState().completeOnboarding();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });

    it("completeOnboarding persists flag to localStorage", () => {
      useAppStore.getState().completeOnboarding();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        ONBOARDING_KEY,
        "true",
      );
    });

    it("checkOnboardingStatus reads true from localStorage", () => {
      localStorageMock.setItem(ONBOARDING_KEY, "true");
      useAppStore.getState().checkOnboardingStatus();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });

    it("checkOnboardingStatus reads false when localStorage empty", () => {
      localStorageMock.clear();
      useAppStore.setState({ hasCompletedOnboarding: true });
      useAppStore.getState().checkOnboardingStatus();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    });
  });

  describe("initializeReturningUser", () => {
    beforeEach(() => {
      useSyncStore.setState({
        status: "local-only",
        credentials: null,
        lastSyncedAt: null,
        error: null,
      });
    });

    it("uses stored keys when available (no passphrase needed)", async () => {
      const mockKeys = {
        dbKeyJwk: { kty: "oct" } as JsonWebKey,
        hmacKeyJwk: { kty: "oct" } as JsonWebKey,
        dbSalt: [1, 2, 3],
      };
      vi.mocked(loadStoredKeys).mockReturnValue(mockKeys);
      vi.mocked(openWithKeys).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useAppStore.getState().initializeReturningUser();

      expect(openWithKeys).toHaveBeenCalledWith(
        mockKeys.dbKeyJwk,
        mockKeys.hmacKeyJwk,
      );
      expect(open).not.toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("falls back to default passphrase for local-only users without stored keys", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("feedzero-default-key");
      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().status).toBe("local-only");
    });

    it("falls back to stored passphrase for legacy local-only users", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      localStorageMock.setItem("feedzero:storage-mode", "local");
      localStorageMock.setItem("feedzero:sync-passphrase", "random local key");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("random local key");
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("restores sync credentials from stored keys for sync users", async () => {
      const mockKeys = {
        dbKeyJwk: { kty: "oct" } as JsonWebKey,
        hmacKeyJwk: { kty: "oct" } as JsonWebKey,
        dbSalt: [1, 2, 3],
        vaultId: "stored-vault-id",
        vaultKeyJwk: {
          kty: "oct",
          key_ops: ["encrypt", "decrypt"],
        } as JsonWebKey,
      };
      vi.mocked(loadStoredKeys).mockReturnValue(mockKeys);
      vi.mocked(openWithKeys).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(pullVault).mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });
      localStorageMock.setItem("feedzero:storage-mode", "sync");

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
      const syncState = useSyncStore.getState();
      expect(syncState.credentials).not.toBeNull();
      expect(syncState.credentials?.vaultId).toBe("stored-vault-id");
      expect(syncState.status).toBe("synced");
    });

    it("migrates legacy sync users: derives keys and removes passphrase", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(pullVault).mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      const { deriveAndStoreKeys } =
        await import("../../src/core/storage/key-material");

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("test phrase");
      expect(deriveAndStoreKeys).toHaveBeenCalledWith(
        "test phrase",
        undefined,
        { includeVaultKeys: true },
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:sync-passphrase",
      );
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("still initializes DB when sync pull fails", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(pullVault).mockResolvedValue({
        ok: false,
        error: "Not found",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("preserves error status when sync pull fails instead of overriding to synced", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({ ok: true, value: [] });
      vi.mocked(pullVault).mockResolvedValue({
        ok: false,
        error: "Sync pull failed (404): Vault not found",
      });

      await useAppStore.getState().initializeReturningUser();

      const syncState = useSyncStore.getState();
      expect(syncState.status).toBe("error");
      expect(syncState.error).toBe("Sync pull failed (404): Vault not found");
    });

    it("sets error when decryption validation fails after opening DB", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({
        ok: false,
        error:
          "Failed to decrypt 5 records. This may indicate an incorrect passphrase.",
      });

      await useAppStore.getState().initializeReturningUser();

      const state = useAppStore.getState();
      expect(state.isDbReady).toBe(false);
      expect(state.error).toBe(
        "Failed to decrypt 5 records. This may indicate an incorrect passphrase.",
      );
    });

    it("does not proceed to sync pull when decryption validation fails", async () => {
      vi.mocked(loadStoredKeys).mockReturnValue(null);
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(getFeeds).mockResolvedValue({
        ok: false,
        error: "Decryption failed",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(pullVault).not.toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(false);
    });
  });
});
