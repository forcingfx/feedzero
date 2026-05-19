import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "../../src/stores/app-store.ts";

vi.mock("../../src/core/storage/key-manager.ts", () => ({
  initFresh: vi.fn(),
  restore: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("../../src/core/storage/crypto.ts", () => ({
  importCryptoKey: vi.fn().mockResolvedValue("mock-vault-key"),
}));

import { initFresh, restore, destroy } from "../../src/core/storage/key-manager.ts";
import { pullVault, importVault } from "../../src/core/sync/sync-service";
import { useSyncStore } from "../../src/stores/sync-store.ts";

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

  it("initialize calls initFresh and sets isDbReady on success", async () => {
    vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: { credentials: null },
    });

    await useAppStore.getState().initialize("test-key");

    expect(initFresh).toHaveBeenCalledWith("test-key", undefined);
    expect(useAppStore.getState().isDbReady).toBe(true);
    expect(useAppStore.getState().error).toBeNull();
  });

  it("initialize sets error on failure", async () => {
    vi.mocked(initFresh).mockResolvedValue({
      ok: false,
      error: "Init failed",
    });

    await useAppStore.getState().initialize("test-key");

    expect(useAppStore.getState().isDbReady).toBe(false);
    expect(useAppStore.getState().error).toBe("Init failed");
  });

  it("initialize passes sync option to initFresh", async () => {
    vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: { credentials: { vaultId: "v", vaultKey: "k" as unknown as CryptoKey } },
    });

    await useAppStore.getState().initialize("test-key", { sync: true });

    expect(initFresh).toHaveBeenCalledWith("test-key", { sync: true });
  });

  it("setError updates error state", () => {
    useAppStore.getState().setError("something broke");
    expect(useAppStore.getState().error).toBe("something broke");

    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });

  describe("onboarding completion", () => {
    it("completeOnboarding sets flag in state and localStorage", () => {
      useAppStore.getState().completeOnboarding();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        ONBOARDING_KEY,
        "true",
      );
    });

    it("checkOnboardingStatus reads from localStorage", () => {
      localStorageMock.setItem(ONBOARDING_KEY, "true");
      useAppStore.getState().checkOnboardingStatus();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });
  });

  describe("groupArticleFloods preference", () => {
    it("defaults to true (feature on)", () => {
      expect(useAppStore.getState().groupArticleFloods).toBe(true);
    });

    it("setGroupArticleFloods(false) updates state and writes 'false' to localStorage", () => {
      useAppStore.getState().setGroupArticleFloods(false);
      expect(useAppStore.getState().groupArticleFloods).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:group-article-floods",
        "false",
      );
    });

    it("setGroupArticleFloods(true) writes 'true' (used when user re-enables after disabling)", () => {
      useAppStore.getState().setGroupArticleFloods(true);
      expect(useAppStore.getState().groupArticleFloods).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:group-article-floods",
        "true",
      );
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

    it("restores from stored keys via KeyManager.restore()", async () => {
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: false,
        credentials: null,
      });

      await useAppStore.getState().initializeReturningUser();

      expect(restore).toHaveBeenCalledOnce();
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("forces re-onboarding when no keys exist (without destroying server vault)", async () => {
      vi.mocked(restore).mockResolvedValue({ status: "no-keys" });

      await useAppStore.getState().initializeReturningUser();

      // No-keys means there's nothing local to destroy AND no vault
      // credentials in memory to issue a server DELETE — but the
      // contract is explicit: a boot-time recovery cascade must never
      // call destroy(). This guards against future regressions where
      // a refactor reintroduces a destructive path.
      expect(destroy).not.toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(false);
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    });

    it("surfaces recovery prompt when keys are invalid (NEVER deletes server vault)", async () => {
      vi.mocked(restore).mockResolvedValue({ status: "invalid-keys" });

      await useAppStore.getState().initializeReturningUser();

      // This is the critical invariant: an "invalid keys" outcome
      // at boot must NEVER delete the server vault. The user might
      // have just had a transient localStorage glitch, a partial
      // browser update, or a key-format migration mid-flight — none
      // of these justify destroying the cloud backup. Issue #117.
      expect(destroy).not.toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(false);
      expect(useAppStore.getState().recoveryMode).toBe("invalid-keys");
    });

    it("restores sync credentials for sync users", async () => {
      const mockCredentials = {
        vaultId: "vault-id",
        vaultKey: "mock-key" as unknown as CryptoKey,
      };
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: true,
        credentials: mockCredentials,
      });
      vi.mocked(pullVault).mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().credentials).toBe(mockCredentials);
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("still initializes when sync pull fails", async () => {
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: true,
        credentials: {
          vaultId: "vault-id",
          vaultKey: "mock-key" as unknown as CryptoKey,
        },
      });
      vi.mocked(pullVault).mockResolvedValue({
        ok: false,
        error: "Not found",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
    });
  });

  describe("resetApp", () => {
    it("calls destroy and resets all state", async () => {
      await useAppStore.getState().resetApp();

      expect(destroy).toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(false);
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    });
  });
});
