import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  pullVaultIfChanged: vi.fn(),
  recoverVault: vi.fn(),
  upgradeVaultKdf: vi.fn().mockImplementation(
    async (_passphrase: string, current: unknown) =>
      ({ ok: true, value: current }),
  ),
  importVault: vi.fn(),
  deleteVault: vi.fn(),
  exportVault: vi.fn(),
  checkVaultExists: vi.fn(),
  mergeVaults: vi.fn(),
}));

vi.mock("../../src/core/sync/vault-crypto", () => ({
  deriveVaultId: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

vi.mock("../../src/core/storage/key-manager", () => ({
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi
    .fn()
    .mockResolvedValue({ ok: true, value: {} }),
  assertKeyDataCoupling: vi
    .fn()
    .mockResolvedValue({ ok: true, value: undefined }),
  updateStoredVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: undefined }),
}));

vi.mock("../../src/core/storage/db", () => ({
  close: vi.fn(),
  deleteDatabase: vi.fn().mockResolvedValue({ ok: true, value: true }),
  open: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("../../src/stores/feed-store", () => ({
  useFeedStore: {
    getState: () => ({ loadFeeds: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("../../src/stores/article-store", () => ({
  useArticleStore: {
    getState: () => ({ preloadAll: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("../../src/stores/preferences-store", () => ({
  usePreferencesStore: {
    getState: () => ({ reload: vi.fn().mockResolvedValue(undefined) }),
  },
}));

import {
  pushVault,
  recoverVault,
  importVault,
  exportVault,
  mergeVaults,
} from "../../src/core/sync/sync-service";

const mockPushVault = vi.mocked(pushVault);
const mockRecoverVault = vi.mocked(recoverVault);
const mockImportVault = vi.mocked(importVault);
const mockExportVault = vi.mocked(exportVault);
const mockMergeVaults = vi.mocked(mergeVaults);

const RECOVERED_CREDENTIALS = {
  vaultId: "mock-vault-id",
  vaultKey: "mock-vault-key" as unknown as CryptoKey,
  kdfSpec: { kind: "pbkdf2-600k" } as const,
};

/**
 * Helper for the new recoverVault shape. The production code calls
 * `recoverVault(passphrase)` and receives `{vault, credentials}` —
 * tests that previously mocked `pullVault` returning the vault
 * directly use this to express the same intent without dragging in
 * the credentials' construction at every site.
 */
function mockRecoveredOk(vault: ReturnType<typeof makeVaultData>) {
  return {
    ok: true as const,
    value: { vault, credentials: RECOVERED_CREDENTIALS },
  };
}

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

const makeVaultData = (feeds: number = 0) => ({
  version: 1,
  exportedAt: Date.now(),
  feeds: Array.from({ length: feeds }, (_, i) => ({
    id: `feed-${i}`,
    url: `https://example${i}.com/rss`,
    title: `Feed ${i}`,
    description: "",
    siteUrl: `https://example${i}.com`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  articles: [],
});

describe("sync-store switchToExistingCloud", () => {
  beforeEach(() => {
    localStorageMock.clear();
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("replace mode", () => {
    it("pulls cloud vault and imports it (replacing local data)", async () => {
      const cloudVault = makeVaultData(3);
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(cloudVault));
      mockImportVault.mockResolvedValue({ ok: true, value: true });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      expect(mockImportVault).toHaveBeenCalledWith(cloudVault);
    });

    it("transitions to synced state on success", async () => {
      const cloudVault = makeVaultData(2);
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(cloudVault));
      mockImportVault.mockResolvedValue({ ok: true, value: true });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.credentials).not.toBeNull();
      expect(state.lastSyncedAt).toBeTypeOf("number");
      expect(state.error).toBeNull();
    });

    it("opens fresh DB with cloud passphrase BEFORE importing (issue #117)", async () => {
      // This is the structural fix: the DB must be opened with keys
      // derived from the cloud passphrase before importVault encrypts
      // anything. Previously, importVault ran first (under stale local
      // keys), then a rekey wrote NEW keys to localStorage — leaving
      // key/data drift that nuked the server vault on next reload.
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData()));
      mockImportVault.mockResolvedValue({ ok: true, value: true });

      const db = await import("../../src/core/storage/db");
      const keyManager = await import("../../src/core/storage/key-manager");

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      // Order verification: close → deleteDatabase → open → import → persist.
      const closeOrder = vi.mocked(db.close).mock.invocationCallOrder[0]!;
      const deleteOrder = vi.mocked(db.deleteDatabase).mock
        .invocationCallOrder[0]!;
      const openOrder = vi.mocked(db.open).mock.invocationCallOrder[0]!;
      const importOrder = mockImportVault.mock.invocationCallOrder[0]!;
      const persistOrder = vi.mocked(keyManager.persistDerivedKeysFromOpenDb)
        .mock.invocationCallOrder[0]!;

      expect(closeOrder).toBeLessThan(deleteOrder);
      expect(deleteOrder).toBeLessThan(openOrder);
      expect(openOrder).toBeLessThan(importOrder);
      expect(importOrder).toBeLessThan(persistOrder);
      expect(vi.mocked(db.open)).toHaveBeenCalledWith("cloud-passphrase");
      expect(keyManager.persistDerivedKeysFromOpenDb).toHaveBeenCalledWith(
        "cloud-passphrase",
        { sync: true, vaultKdfSpec: RECOVERED_CREDENTIALS.kdfSpec },
      );
    });

    it("sets status to syncing during operation", async () => {
      let capturedStatus: string | null = null;
      mockRecoverVault.mockImplementation(async () => {
        capturedStatus = useSyncStore.getState().status;
        return mockRecoveredOk(makeVaultData());
      });
      mockImportVault.mockResolvedValue({ ok: true, value: true });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      expect(capturedStatus).toBe("syncing");
    });

    it("returns error when pull fails", async () => {
      mockRecoverVault.mockResolvedValue({ ok: false, error: "Vault not found" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("bad-passphrase", "replace");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Vault not found");
      }
      expect(useSyncStore.getState().status).toBe("error");
      expect(mockImportVault).not.toHaveBeenCalled();
    });

    it("returns error when import fails", async () => {
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData()));
      mockImportVault.mockResolvedValue({ ok: false, error: "Import failed" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
    });

    it("does not push after replace (cloud already has data)", async () => {
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData()));
      mockImportVault.mockResolvedValue({ ok: true, value: true });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "replace");

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("merge mode", () => {
    it("exports local vault, pulls cloud vault, merges them", async () => {
      const localVault = makeVaultData(2);
      const cloudVault = makeVaultData(3);
      const mergedVault = makeVaultData(5);

      mockExportVault.mockResolvedValue({ ok: true, value: localVault });
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(cloudVault));
      mockMergeVaults.mockReturnValue({ ok: true, value: mergedVault });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      mockPushVault.mockResolvedValue({ ok: true, value: { updatedAt: Date.now(), etag: null } });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(mockExportVault).toHaveBeenCalled();
      expect(mockMergeVaults).toHaveBeenCalledWith(localVault, cloudVault);
    });

    it("imports merged vault and pushes to cloud", async () => {
      const localVault = makeVaultData(2);
      const cloudVault = makeVaultData(3);
      const mergedVault = makeVaultData(5);

      mockExportVault.mockResolvedValue({ ok: true, value: localVault });
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(cloudVault));
      mockMergeVaults.mockReturnValue({ ok: true, value: mergedVault });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      mockPushVault.mockResolvedValue({ ok: true, value: { updatedAt: Date.now(), etag: null } });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(mockImportVault).toHaveBeenCalledWith(mergedVault);
      expect(mockPushVault).toHaveBeenCalled();
    });

    it("transitions to synced state on success", async () => {
      mockExportVault.mockResolvedValue({ ok: true, value: makeVaultData(1) });
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData(2)));
      mockMergeVaults.mockReturnValue({ ok: true, value: makeVaultData(3) });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      mockPushVault.mockResolvedValue({ ok: true, value: { updatedAt: Date.now(), etag: null } });

      await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.credentials).not.toBeNull();
    });

    it("returns error when export fails", async () => {
      mockExportVault.mockResolvedValue({ ok: false, error: "Export failed" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
      expect(mockRecoverVault).not.toHaveBeenCalled();
    });

    it("returns error when pull fails", async () => {
      mockExportVault.mockResolvedValue({ ok: true, value: makeVaultData(1) });
      mockRecoverVault.mockResolvedValue({ ok: false, error: "Pull failed" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
      expect(mockMergeVaults).not.toHaveBeenCalled();
    });

    it("returns error when merge fails", async () => {
      mockExportVault.mockResolvedValue({ ok: true, value: makeVaultData(1) });
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData(2)));
      mockMergeVaults.mockReturnValue({ ok: false, error: "Merge failed" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
      expect(mockImportVault).not.toHaveBeenCalled();
    });

    it("returns error when push fails (but keeps local merged data)", async () => {
      const mergedVault = makeVaultData(3);
      mockExportVault.mockResolvedValue({ ok: true, value: makeVaultData(1) });
      mockRecoverVault.mockResolvedValue(mockRecoveredOk(makeVaultData(2)));
      mockMergeVaults.mockReturnValue({ ok: true, value: mergedVault });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      mockPushVault.mockResolvedValue({ ok: false, error: "Push failed" });

      const result = await useSyncStore
        .getState()
        .switchToExistingCloud("cloud-passphrase", "merge");

      expect(result.ok).toBe(false);
      expect(useSyncStore.getState().status).toBe("error");
      // Import should still have been called with merged data
      expect(mockImportVault).toHaveBeenCalledWith(mergedVault);
    });
  });
});
