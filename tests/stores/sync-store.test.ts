import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
  deleteVault: vi.fn(),
}));

vi.mock("../../src/core/storage/db", () => ({
  deleteDatabase: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getSalt: vi
    .fn()
    .mockResolvedValue({ ok: true, value: new Uint8Array([1, 2, 3]) }),
  exportCurrentKeys: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      dbKeyJwk: { kty: "oct", k: "db-key" },
      hmacKeyJwk: { kty: "oct", k: "hmac-key" },
    },
  }),
}));

vi.mock("../../src/core/storage/crypto", () => ({
  exportCryptoKey: vi.fn().mockResolvedValue({ kty: "oct", k: "vault-key" }),
}));

vi.mock("../../src/core/sync/vault-crypto", () => ({
  deriveVaultId: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

vi.mock("../../src/core/storage/key-material", () => ({
  deriveAndStoreKeys: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  clearStoredKeys: vi.fn(),
}));

import {
  pushVault,
  pullVault,
  importVault,
  deleteVault,
} from "../../src/core/sync/sync-service";
import { deleteDatabase } from "../../src/core/storage/db";
import { useAppStore } from "../../src/stores/app-store";
import { clearStoredKeys } from "../../src/core/storage/key-material";

const mockPushVault = vi.mocked(pushVault);
const mockPullVault = vi.mocked(pullVault);
const mockImportVault = vi.mocked(importVault);
const mockDeleteVault = vi.mocked(deleteVault);
const mockDeleteDatabase = vi.mocked(deleteDatabase);

/** A fake SyncCredentials object for use in tests. */
const mockCredentials = {
  vaultId: "mock-vault-id",
  vaultKey: "mock-vault-key" as unknown as CryptoKey,
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
    vi.useFakeTimers();
    localStorageMock.clear();
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
      dialogOpen: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with local-only status", () => {
    const state = useSyncStore.getState();
    expect(state.status).toBe("local-only");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.credentials).toBeNull();
  });

  it("setDialogOpen toggles dialog state", () => {
    useSyncStore.getState().setDialogOpen(true);
    expect(useSyncStore.getState().dialogOpen).toBe(true);
    useSyncStore.getState().setDialogOpen(false);
    expect(useSyncStore.getState().dialogOpen).toBe(false);
  });

  describe("enableSync", () => {
    it("transitions local-only → syncing → synced on success", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });

      const promise = useSyncStore.getState().enableSync("test passphrase");

      // After deriving credentials (async), status transitions to syncing
      await promise;

      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBe(timestamp);
      expect(state.error).toBeNull();
    });

    it("persists current DB keys with vault keys in localStorage", async () => {
      mockPushVault.mockResolvedValue({ ok: true, value: Date.now() });

      await useSyncStore.getState().enableSync("test passphrase");

      // Should store current DB keys + new vault keys (not re-derived DB keys)
      const stored = JSON.parse(
        localStorageMock.getItem("feedzero:derived-keys") ?? "null",
      );
      expect(stored).not.toBeNull();
      expect(stored.dbKeyJwk).toBeDefined();
      expect(stored.hmacKeyJwk).toBeDefined();
      expect(stored.vaultId).toBeDefined();
      expect(stored.vaultKeyJwk).toBeDefined();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
        "sync",
      );
    });

    it("transitions to error on push failure", async () => {
      mockPushVault.mockResolvedValue({ ok: false, error: "Network failed" });

      await useSyncStore.getState().enableSync("test passphrase");

      const state = useSyncStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Network failed");
    });
  });

  describe("push", () => {
    it("pushes vault and updates timestamp on success", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().push();

      expect(mockPushVault).toHaveBeenCalledWith(mockCredentials);
      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBe(timestamp);
    });

    it("transitions to error on push failure", async () => {
      mockPushVault.mockResolvedValue({ ok: false, error: "Server down" });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().push();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Server down");
    });

    it("does nothing when no credentials are set", async () => {
      useSyncStore.setState({ status: "local-only", credentials: null });

      await useSyncStore.getState().push();

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("pull", () => {
    it("pulls vault, imports data, and transitions to synced", async () => {
      const vaultData = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [],
        articles: [],
      };
      mockPullVault.mockResolvedValue({ ok: true, value: vaultData });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(mockPullVault).toHaveBeenCalledWith(mockCredentials);
      expect(mockImportVault).toHaveBeenCalledWith(vaultData);
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("transitions to error on pull failure", async () => {
      mockPullVault.mockResolvedValue({ ok: false, error: "Not found" });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Not found");
    });

    it("transitions to error on import failure", async () => {
      mockPullVault.mockResolvedValue({
        ok: true,
        value: {
          version: 1,
          exportedAt: Date.now(),
          feeds: [],
          articles: [],
        },
      });
      mockImportVault.mockResolvedValue({ ok: false, error: "Import failed" });
      useSyncStore.setState({ credentials: mockCredentials });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Import failed");
    });

    it("does nothing when no credentials are set", async () => {
      useSyncStore.setState({ status: "local-only", credentials: null });

      await useSyncStore.getState().pull();

      expect(mockPullVault).not.toHaveBeenCalled();
    });
  });

  describe("scheduleSyncPush", () => {
    it("debounces multiple rapid calls into a single push", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      useSyncStore.getState().scheduleSyncPush();
      useSyncStore.getState().scheduleSyncPush();
      useSyncStore.getState().scheduleSyncPush();

      // Advance past debounce + max jitter (5s + 30s)
      await vi.advanceTimersByTimeAsync(35000);

      expect(mockPushVault).toHaveBeenCalledTimes(1);
    });

    it("adds random jitter after debounce to prevent timing analysis", async () => {
      mockPushVault.mockResolvedValue({ ok: true, value: Date.now() });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      useSyncStore.getState().scheduleSyncPush();

      // After debounce (5s) but before max jitter (30s), push may not have fired
      await vi.advanceTimersByTimeAsync(5000);
      const callsAtDebounce = mockPushVault.mock.calls.length;

      // After full jitter window, push must have fired
      await vi.advanceTimersByTimeAsync(30000);
      expect(mockPushVault).toHaveBeenCalledTimes(1);

      // The push should not always fire at exactly the debounce time
      expect(callsAtDebounce).toBeLessThanOrEqual(1);
    });

    it("does not push when status is local-only", async () => {
      useSyncStore.setState({ status: "local-only", credentials: null });

      useSyncStore.getState().scheduleSyncPush();
      await vi.advanceTimersByTimeAsync(35000);

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("restoreSync", () => {
    it("sets credentials and status without pushing to server", () => {
      useSyncStore.getState().restoreSync(mockCredentials);

      const state = useSyncStore.getState();
      expect(state.credentials).toBe(mockCredentials);
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBeTypeOf("number");
      expect(state.error).toBeNull();
      expect(mockPushVault).not.toHaveBeenCalled();
    });

    it("persists storage mode to localStorage", () => {
      useSyncStore.getState().restoreSync(mockCredentials);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
        "sync",
      );
    });
  });

  describe("disableSync", () => {
    it("deletes server vault, re-stores DB keys without vault keys, and resets state", async () => {
      mockDeleteVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().disableSync();

      expect(mockDeleteVault).toHaveBeenCalledWith(mockCredentials);
      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
      // Should re-persist DB keys (without vault keys) for future sessions
      const stored = JSON.parse(
        localStorageMock.getItem("feedzero:derived-keys") ?? "null",
      );
      expect(stored).not.toBeNull();
      expect(stored.dbKeyJwk).toBeDefined();
      expect(stored.hmacKeyJwk).toBeDefined();
      expect(stored.vaultId).toBeUndefined();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
      );
    });

    it("still clears local state even if server deletion fails", async () => {
      mockDeleteVault.mockResolvedValue({ ok: false, error: "Network error" });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().disableSync();

      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
      // DB keys should still be re-persisted even if vault deletion fails
      const stored = JSON.parse(
        localStorageMock.getItem("feedzero:derived-keys") ?? "null",
      );
      expect(stored).not.toBeNull();
    });

    it("cancels pending debounced push", async () => {
      mockPushVault.mockResolvedValue({ ok: true, value: Date.now() });
      mockDeleteVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      useSyncStore.getState().scheduleSyncPush();
      await useSyncStore.getState().disableSync();
      await vi.advanceTimersByTimeAsync(35000);

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("deletes the local database", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().logout();

      expect(mockDeleteDatabase).toHaveBeenCalled();
    });

    it("does NOT delete the server vault", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().logout();

      expect(mockDeleteVault).not.toHaveBeenCalled();
    });

    it("clears stored keys and sync-related localStorage keys", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
      });

      await useSyncStore.getState().logout();

      expect(clearStoredKeys).toHaveBeenCalled();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:onboarding-complete",
      );
    });

    it("resets sync state to local-only defaults", async () => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
        error: "some old error",
      });

      await useSyncStore.getState().logout();

      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.credentials).toBeNull();
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
    });

    it("resets app store (isDbReady and hasCompletedOnboarding)", async () => {
      useAppStore.setState({
        isDbReady: true,
        hasCompletedOnboarding: true,
      });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().logout();

      const appState = useAppStore.getState();
      expect(appState.isDbReady).toBe(false);
      expect(appState.hasCompletedOnboarding).toBe(false);
    });

    it("cancels pending debounce timer", async () => {
      mockPushVault.mockResolvedValue({ ok: true, value: Date.now() });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      useSyncStore.getState().scheduleSyncPush();
      await useSyncStore.getState().logout();
      await vi.advanceTimersByTimeAsync(35000);

      expect(mockPushVault).not.toHaveBeenCalled();
    });

    it("resets feed store (clears feeds and selectedFeedId)", async () => {
      const { useFeedStore } = await import("../../src/stores/feed-store");
      useFeedStore.setState({
        feeds: [
          {
            id: "f1",
            title: "Test",
            url: "https://example.com/feed",
            description: "",
            siteUrl: "",
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        selectedFeedId: "f1",
      });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().logout();

      const feedState = useFeedStore.getState();
      expect(feedState.feeds).toEqual([]);
      expect(feedState.selectedFeedId).toBeNull();
    });

    it("resets article store (clears articles and selectedArticle)", async () => {
      const { useArticleStore } =
        await import("../../src/stores/article-store");
      const mockArticle = {
        id: "a1",
        feedId: "f1",
        guid: "g1",
        title: "Article",
        link: "",
        content: "",
        summary: "",
        author: "",
        publishedAt: 0,
        read: false,
        createdAt: 0,
      };
      useArticleStore.setState({
        articles: [mockArticle],
        selectedArticle: mockArticle,
      });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().logout();

      const articleState = useArticleStore.getState();
      expect(articleState.articles).toEqual([]);
      expect(articleState.selectedArticle).toBeNull();
    });

    it("resets onboarding store to initial state", async () => {
      const { useOnboardingStore } =
        await import("../../src/stores/onboarding-store");
      useOnboardingStore.setState({
        step: "passphrase-confirm",
        storageMode: "sync",
        generatedPassphrase: "some old passphrase",
      });
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
      });

      await useSyncStore.getState().logout();

      const onboardingState = useOnboardingStore.getState();
      expect(onboardingState.step).toBe("welcome");
      expect(onboardingState.storageMode).toBeNull();
      expect(onboardingState.generatedPassphrase).toBe("");
    });
  });
});
