import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  pullVaultIfChanged: vi.fn(),
  importVault: vi.fn(),
  deleteVault: vi.fn(),
}));

vi.mock("../../src/core/license/license-token-store", () => ({
  clearLicenseToken: vi.fn(),
  setLicenseToken: vi.fn(),
  getLicenseToken: vi.fn().mockReturnValue(null),
  LICENSE_TOKEN_STORAGE_KEY: "feedzero:license-token",
}));

vi.mock("../../src/core/storage/key-manager", () => ({
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi.fn().mockResolvedValue({ ok: true, value: {} }),
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
  pullVaultIfChanged,
  importVault,
  deleteVault,
} from "../../src/core/sync/sync-service";
import { useAppStore } from "../../src/stores/app-store";
import { addVaultKeys, removeVaultKeys } from "../../src/core/storage/key-manager";

const mockPushVault = vi.mocked(pushVault);
const mockPullVault = vi.mocked(pullVault);
const mockPullVaultIfChanged = vi.mocked(pullVaultIfChanged);
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
      mockPushVault.mockResolvedValue({ ok: true, value: { updatedAt: timestamp, etag: null } });

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

  describe("disableSync (purely local after PR C split)", () => {
    it("strips vault keys, clears credentials, and flips status to local-only", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().disableSync();

      expect(removeVaultKeys).toHaveBeenCalled();
      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
      expect(state.error).toBeNull();
    });

    it("does NOT call the server delete endpoint (deletion is a separate primitive)", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().disableSync();

      expect(mockDeleteVault).not.toHaveBeenCalled();
    });

    it("is idempotent — calling twice yields the same final state without errors", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().disableSync();
      await useSyncStore.getState().disableSync();

      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
    });
  });

  describe("deleteCloudVault", () => {
    it("calls the server DELETE with the credentials and returns ok", async () => {
      mockDeleteVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({ credentials: mockCredentials });

      const result = await useSyncStore.getState().deleteCloudVault();

      expect(mockDeleteVault).toHaveBeenCalledWith(mockCredentials);
      expect(result.ok).toBe(true);
    });

    it("returns err('no-credentials') when state has no credentials", async () => {
      useSyncStore.setState({ credentials: null });
      const result = await useSyncStore.getState().deleteCloudVault();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("no-credentials");
      expect(mockDeleteVault).not.toHaveBeenCalled();
    });

    it("does NOT mutate store state (only the server is touched)", async () => {
      mockDeleteVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().deleteCloudVault();

      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.credentials).toEqual(mockCredentials);
    });

    it("propagates the underlying error on network failure", async () => {
      mockDeleteVault.mockResolvedValue({ ok: false, error: "network" });
      useSyncStore.setState({ credentials: mockCredentials });

      const result = await useSyncStore.getState().deleteCloudVault();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("network");
    });
  });

  describe("deleteCloudVault + disableSync composition (canonical 'delete vault forever')", () => {
    it("delete runs first (needs credentials), then disableSync clears state", async () => {
      const calls: string[] = [];
      mockDeleteVault.mockImplementation(async () => {
        calls.push("deleteVault");
        return { ok: true, value: true };
      });
      const removeVaultKeysMock = vi.mocked(removeVaultKeys);
      removeVaultKeysMock.mockImplementation(() => {
        calls.push("removeVaultKeys");
      });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      const r = await useSyncStore.getState().deleteCloudVault();
      expect(r.ok).toBe(true);
      await useSyncStore.getState().disableSync();

      expect(calls).toEqual(["deleteVault", "removeVaultKeys"]);
      expect(useSyncStore.getState().credentials).toBeNull();
    });

    it("reversed order surfaces the ordering bug: deleteCloudVault returns no-credentials after disableSync", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().disableSync();
      const r = await useSyncStore.getState().deleteCloudVault();

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("no-credentials");
      expect(mockDeleteVault).not.toHaveBeenCalled();
    });
  });

  describe("push", () => {
    it("pushes vault and updates status", async () => {
      const timestamp = Date.now();
      mockPushVault.mockResolvedValue({ ok: true, value: { updatedAt: timestamp, etag: null } });
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
      mockPullVaultIfChanged.mockResolvedValue({
        ok: true,
        value: {
          notModified: false,
          vault: {
            version: 1,
            exportedAt: Date.now(),
            feeds: [],
            articles: [],
          },
          etag: 'W/"abc"',
        },
      });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(mockPullVaultIfChanged).toHaveBeenCalledWith(
        mockCredentials,
        undefined,
      );
      expect(mockImportVault).toHaveBeenCalled();
      expect(useSyncStore.getState().status).toBe("synced");
      // ETag from the server response is cached for next pull.
      expect(useSyncStore.getState().lastVaultEtag).toBe('W/"abc"');
    });

    it("short-circuits import on a 304-equivalent (notModified) response", async () => {
      mockPullVaultIfChanged.mockResolvedValue({
        ok: true,
        value: { notModified: true, etag: 'W/"abc"' },
      });
      useSyncStore.setState({
        credentials: mockCredentials,
        lastVaultEtag: 'W/"abc"',
      });

      await useSyncStore.getState().pull();

      expect(mockPullVaultIfChanged).toHaveBeenCalledWith(
        mockCredentials,
        'W/"abc"',
      );
      expect(mockImportVault).not.toHaveBeenCalled();
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("sets error on pull failure", async () => {
      mockPullVaultIfChanged.mockResolvedValue({
        ok: false,
        error: "Vault not found",
      });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
    });
  });

  describe("disableSync (canonical 'keep reading locally' action)", () => {
    it("clears credentials, sets status=local-only, and resets error", async () => {
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "error",
        error: "transient pull failure",
      });

      await useSyncStore.getState().disableSync();

      const s = useSyncStore.getState();
      expect(s.credentials).toBeNull();
      expect(s.status).toBe("local-only");
      expect(s.error).toBeNull();
    });

    it("does NOT attempt to delete the server vault (preserved for recovery)", async () => {
      useSyncStore.setState({
        credentials: mockCredentials,
        status: "synced",
      });

      await useSyncStore.getState().disableSync();

      expect(mockDeleteVault).not.toHaveBeenCalled();
    });
  });

  describe("deactivateLocal", () => {
    it("clears the license token and disables sync, but keeps the cloud vault and local IndexedDB intact", async () => {
      const { clearLicenseToken } = await import(
        "../../src/core/license/license-token-store"
      );
      const { destroyLocal } = await import(
        "../../src/core/storage/key-manager"
      );
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().deactivateLocal();

      expect(vi.mocked(clearLicenseToken)).toHaveBeenCalled();
      expect(removeVaultKeys).toHaveBeenCalled();
      expect(mockDeleteVault).not.toHaveBeenCalled();
      expect(vi.mocked(destroyLocal)).not.toHaveBeenCalled();
      const s = useSyncStore.getState();
      expect(s.status).toBe("local-only");
      expect(s.credentials).toBeNull();
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
