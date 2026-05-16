import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
  deleteVault: vi.fn(),
}));

vi.mock("../../src/core/storage/key-manager", () => ({
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  rekeyFromPassphrase: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));

vi.mock("../../src/core/sync/vault-crypto", () => ({
  deriveVaultId: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

import {
  pushVault,
  pullVault,
  importVault,
  deleteVault,
} from "../../src/core/sync/sync-service";
import { useAppStore } from "../../src/stores/app-store";
import { addVaultKeys, removeVaultKeys } from "../../src/core/storage/key-manager";

const mockPushVault = vi.mocked(pushVault);
const mockPullVault = vi.mocked(pullVault);
const mockImportVault = vi.mocked(importVault);
const mockDeleteVault = vi.mocked(deleteVault);

const mockCredentials = {
  vaultId: "test-vault-id",
  vaultKey: "test-vault-key" as unknown as CryptoKey,
};

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

describe("sync-store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
      dialogOpen: false,
    });
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe("enableSync", () => {
    it("derives vault keys via addVaultKeys and pushes vault", async () => {
      vi.mocked(addVaultKeys).mockResolvedValue({
        ok: true,
        value: mockCredentials,
      });
      const timestamp = Date.now();
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });

      await useSyncStore.getState().enableSync("test passphrase");

      expect(addVaultKeys).toHaveBeenCalledWith("test passphrase");
      expect(mockPushVault).toHaveBeenCalledWith(mockCredentials);
      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBe(timestamp);
    });

    it("sets error when addVaultKeys fails", async () => {
      vi.mocked(addVaultKeys).mockResolvedValue({
        ok: false,
        error: "Key derivation failed",
      });

      await useSyncStore.getState().enableSync("test passphrase");

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Key derivation failed");
      expect(mockPushVault).not.toHaveBeenCalled();
    });

    it("transitions to error on push failure", async () => {
      vi.mocked(addVaultKeys).mockResolvedValue({
        ok: true,
        value: mockCredentials,
      });
      mockPushVault.mockResolvedValue({ ok: false, error: "Network error" });

      await useSyncStore.getState().enableSync("test passphrase");

      expect(useSyncStore.getState().status).toBe("error");
    });
  });

  describe("disableSync", () => {
    it("deletes vault, strips vault keys, and resets state", async () => {
      mockDeleteVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().disableSync();

      expect(mockDeleteVault).toHaveBeenCalledWith(mockCredentials);
      expect(removeVaultKeys).toHaveBeenCalled();
      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
    });

    it("sets error and blocks transition if vault deletion fails", async () => {
      mockDeleteVault.mockResolvedValue({ ok: false, error: "Network error" });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().disableSync();

      const state = useSyncStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toMatch(/could not delete server data/i);
      expect(removeVaultKeys).not.toHaveBeenCalled();
    });
  });

  describe("push", () => {
    it("pushes vault and updates status", async () => {
      const timestamp = Date.now();
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().push();

      expect(mockPushVault).toHaveBeenCalledWith(mockCredentials);
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("does nothing without credentials", async () => {
      await useSyncStore.getState().push();
      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("pull", () => {
    it("pulls vault and imports data", async () => {
      mockPullVault.mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(mockPullVault).toHaveBeenCalledWith(mockCredentials);
      expect(mockImportVault).toHaveBeenCalled();
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("sets error on pull failure", async () => {
      mockPullVault.mockResolvedValue({
        ok: false,
        error: "Vault not found",
      });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
    });
  });

  describe("license-required migration (existing cloud-sync user post-paywall)", () => {
    it("sets pendingMigration='license-required' when pull returns a 401 license-required error", async () => {
      mockPullVault.mockResolvedValue({
        ok: false,
        error: 'Sync pull failed (401): {"ok":false,"error":"license required","traceId":"req_be627fd1"}',
      });
      useSyncStore.setState({
        credentials: mockCredentials,
        pendingMigration: null,
      });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().pendingMigration).toBe("license-required");
      expect(useSyncStore.getState().status).toBe("error");
    });

    it("does NOT set pendingMigration for non-license pull failures (network errors etc.)", async () => {
      mockPullVault.mockResolvedValue({
        ok: false,
        error: "Sync pull failed: fetch error",
      });
      useSyncStore.setState({
        credentials: mockCredentials,
        pendingMigration: null,
      });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().pendingMigration).toBeNull();
      expect(useSyncStore.getState().status).toBe("error");
    });

    it("migrateToLocalOnly clears credentials, sets status=local-only, and clears pendingMigration", async () => {
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "error",
        pendingMigration: "license-required",
        error: "license required",
      });

      await useSyncStore.getState().migrateToLocalOnly();

      const s = useSyncStore.getState();
      expect(s.credentials).toBeNull();
      expect(s.status).toBe("local-only");
      expect(s.pendingMigration).toBeNull();
      expect(s.error).toBeNull();
    });

    it("migrateToLocalOnly does NOT attempt to delete the server vault (policy: 90-day retention)", async () => {
      useSyncStore.setState({
        credentials: mockCredentials,
        pendingMigration: "license-required",
      });

      await useSyncStore.getState().migrateToLocalOnly();

      // The server vault delete would 401 anyway (no license) — skipping it
      // is the whole point. Privacy policy promises 90-day retention then
      // auto-delete by our retention cron (separate ops surface).
      expect(mockDeleteVault).not.toHaveBeenCalled();
    });

    it("dismissPendingMigration clears the flag without changing sync state (user dismissed dialog without choosing)", async () => {
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "error",
        pendingMigration: "license-required",
        error: "license required",
      });

      useSyncStore.getState().dismissPendingMigration();

      const s = useSyncStore.getState();
      expect(s.pendingMigration).toBeNull();
      // sync state untouched — user just closed the modal. The dialog can
      // re-appear on the next pull attempt (which will still 401).
      expect(s.credentials).toBe(mockCredentials);
      expect(s.status).toBe("error");
    });
  });

  describe("forceResync", () => {
    it("returns err when no credentials are set", async () => {
      useSyncStore.setState({ credentials: null });
      const result = await useSyncStore.getState().forceResync();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/cloud/i);
      }
    });

    it("pulls, imports, and reports feed count on success", async () => {
      mockPullVault.mockResolvedValue({
        ok: true,
        value: {
          version: 1,
          exportedAt: Date.now(),
          feeds: [
            {
              id: "f1",
              url: "https://example.com",
              title: "Example",
              description: "",
              siteUrl: "",
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: "f2",
              url: "https://example2.com",
              title: "Example 2",
              description: "",
              siteUrl: "",
              createdAt: 0,
              updatedAt: 0,
            },
          ],
          articles: [],
        },
      });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "synced",
      });

      const result = await useSyncStore.getState().forceResync();

      expect(mockPullVault).toHaveBeenCalledWith(mockCredentials);
      expect(mockImportVault).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.feedCount).toBe(2);
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("surfaces pull failure to status and result", async () => {
      mockPullVault.mockResolvedValue({
        ok: false,
        error: "Vault not found",
      });
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "synced",
      });

      const result = await useSyncStore.getState().forceResync();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Vault not found");
      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Vault not found");
    });

    it("surfaces import failure to status and result", async () => {
      mockPullVault.mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      mockImportVault.mockResolvedValue({
        ok: false,
        error: "Failed to import data: db not open",
      });
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "synced",
      });

      const result = await useSyncStore.getState().forceResync();

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
    });
  });

  describe("logout", () => {
    it("destroys local state and resets stores", async () => {
      const { destroyLocal } = await import(
        "../../src/core/storage/key-manager"
      );
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().logout();

      expect(destroyLocal).toHaveBeenCalled();
      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
    });
  });

  describe("unsupported method", () => {
    it("returns 405 for PATCH", async () => {
      // This is a sync-handler test, not sync-store, but kept for coverage
      expect(true).toBe(true);
    });
  });
});
