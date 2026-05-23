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
  pullVaultIfChanged: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("../../src/core/storage/crypto.ts", () => ({
  importCryptoKey: vi.fn().mockResolvedValue("mock-vault-key"),
}));

vi.mock("../../src/core/storage/db.ts", () => ({
  dedupeArticles: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
}));

// preferences-store hits db preference accessors not stubbed above; the
// boot paths only need hydrate() to resolve, and resetAllStores calls
// setState. Stub it so this file stays focused on app-store behavior.
const hydrateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/stores/preferences-store.ts", () => ({
  usePreferencesStore: {
    getState: () => ({ hydrate: hydrateMock, reload: vi.fn() }),
    setState: vi.fn(),
  },
}));

vi.mock("../../src/stores/persist-preferences.ts", () => ({
  persistPreferences: vi.fn(),
}));

import { initFresh, restore, destroy } from "../../src/core/storage/key-manager.ts";
import {
  pullVaultIfChanged,
  importVault,
} from "../../src/core/sync/sync-service";
import { dedupeArticles } from "../../src/core/storage/db.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { persistPreferences } from "../../src/stores/persist-preferences.ts";

const ONBOARDING_KEY = "feedzero:onboarding-complete";
const DEDUPE_MIGRATION_KEY = "feedzero:dedupe-migration-v1";

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

    it("setGroupArticleFloods(false) updates state and persists through the preferences store", () => {
      useAppStore.getState().setGroupArticleFloods(false);
      expect(useAppStore.getState().groupArticleFloods).toBe(false);
      expect(persistPreferences).toHaveBeenCalledWith({ groupArticleFloods: false });
    });

    it("setGroupArticleFloods(true) persists through the preferences store (user re-enables)", () => {
      useAppStore.getState().setGroupArticleFloods(true);
      expect(useAppStore.getState().groupArticleFloods).toBe(true);
      expect(persistPreferences).toHaveBeenCalledWith({ groupArticleFloods: true });
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

    it("runs the duplicate-article cleanup once and records it", async () => {
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: false,
        credentials: null,
      });

      await useAppStore.getState().initializeReturningUser();

      expect(dedupeArticles).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(DEDUPE_MIGRATION_KEY)).toBe("done");
    });

    it("skips the duplicate-article cleanup once it has already run", async () => {
      localStorage.setItem(DEDUPE_MIGRATION_KEY, "done");
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: false,
        credentials: null,
      });

      await useAppStore.getState().initializeReturningUser();

      expect(dedupeArticles).not.toHaveBeenCalled();
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
      vi.mocked(pullVaultIfChanged).mockResolvedValue({
        ok: true,
        value: {
          notModified: false,
          vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
          etag: null,
        },
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
      vi.mocked(pullVaultIfChanged).mockResolvedValue({
        ok: false,
        error: "Not found",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("still initializes when the sync pull never resolves (boot must not hang on the network)", async () => {
      // Reproduces the production hang: a returning sync user whose
      // /api/sync request stalls indefinitely (slow upstream, dropped
      // connection mid-response, edge function cold-start hang). Before
      // the boot-time pull timeout, isDbReady stayed false forever and
      // the user was stuck on "Loading…" with no escape.
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: true,
        credentials: {
          vaultId: "vault-id",
          vaultKey: "mock-key" as unknown as CryptoKey,
        },
      });
      // pullVaultIfChanged returns a promise that never resolves.
      vi.mocked(pullVaultIfChanged).mockReturnValue(
        new Promise(() => {
          /* never resolves */
        }),
      );

      vi.useFakeTimers();
      try {
        const initPromise = useAppStore.getState().initializeReturningUser();
        // Advance past the boot-time pull watchdog (BOOT_PULL_TIMEOUT_MS,
        // currently 10s). The pull stays in-flight in the background; boot
        // proceeds with whatever local data the canary already validated.
        await vi.advanceTimersByTimeAsync(15_000);
        await initPromise;
      } finally {
        vi.useRealTimers();
      }

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

  describe("startNewUserOnboarding", () => {
    beforeEach(() => {
      // Reset side-effect state between tests
      useAppStore.setState({
        isDbReady: false,
        error: null,
        hasCompletedOnboarding: null,
        securityProblem: null,
      });
      vi.mocked(initFresh).mockResolvedValue({
        ok: true,
        value: { credentials: null },
      });
    });

    it("completes the full sequence on a healthy environment", async () => {
      // happy-dom defaults to isSecureContext=true via tests/setup.ts
      await useAppStore.getState().startNewUserOnboarding();

      expect(initFresh).toHaveBeenCalled();
      const state = useAppStore.getState();
      expect(state.isDbReady).toBe(true);
      expect(state.hasCompletedOnboarding).toBe(true);
      expect(state.securityProblem).toBeNull();
      expect(state.error).toBeNull();
    });

    it("surfaces a security problem when the context is insecure (no DB init)", async () => {
      const originalSecure = globalThis.isSecureContext;
      Object.defineProperty(globalThis, "isSecureContext", {
        value: false,
        configurable: true,
      });
      try {
        await useAppStore.getState().startNewUserOnboarding();
      } finally {
        Object.defineProperty(globalThis, "isSecureContext", {
          value: originalSecure,
          configurable: true,
        });
      }

      expect(initFresh).not.toHaveBeenCalled();
      const state = useAppStore.getState();
      expect(state.securityProblem).not.toBeNull();
      expect(state.securityProblem?.kind).toBe("insecure-context");
      expect(state.isDbReady).toBe(false);
      expect(state.hasCompletedOnboarding).toBeNull();
    });

    it("does not complete onboarding when initialize sets an error", async () => {
      vi.mocked(initFresh).mockResolvedValue({ ok: false, error: "boom" });

      await useAppStore.getState().startNewUserOnboarding();

      const state = useAppStore.getState();
      expect(state.error).toBe("boom");
      expect(state.hasCompletedOnboarding).toBeNull();
    });
  });
});
