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
    // Reset BOTH the FSM canonical (bootState) and the legacy mirror
    // fields so every test starts from a clean slate. Without this,
    // the FSM carries forward from a prior test's `ready` and the
    // next dispatch({type:"boot"}) is a no-op.
    useAppStore.setState({
      bootState: { kind: "unknown" },
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
      recoveryMode: null,
      securityProblem: null,
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
      value: { credentials: { vaultId: "v", vaultKey: "k" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } } },
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
      kdfSpec: { kind: "pbkdf2-600k" } as const,
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
      // Pull runs in the background — flush microtasks so its .then settles
      // and the status transitions from "syncing" to "synced".
      await Promise.resolve();
      await Promise.resolve();
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("still initializes when sync pull fails", async () => {
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: true,
        credentials: {
          vaultId: "vault-id",
          vaultKey: "mock-key" as unknown as CryptoKey,
        kdfSpec: { kind: "pbkdf2-600k" } as const,
        },
      });
      vi.mocked(pullVaultIfChanged).mockResolvedValue({
        ok: false,
        error: "Not found",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    it("mounts instantly for sync users — pull happens in the background", async () => {
      // On mobile, blocking isDbReady on the cloud pull was the cause of
      // the "Loading… for a few seconds" complaint. The pull now fires
      // in the background so the UI can render whatever the canary-
      // validated local DB already has; refreshAll (kicked off by
      // AppInit) waits on the same in-flight pull via sync-store dedup
      // and then fetches fresh articles when it lands.
      vi.mocked(restore).mockResolvedValue({
        status: "ready",
        isSyncUser: true,
        credentials: {
          vaultId: "vault-id",
          vaultKey: "mock-key" as unknown as CryptoKey,
          kdfSpec: { kind: "pbkdf2-600k" } as const,
        },
      });
      // Pull never resolves — boot still completes promptly.
      vi.mocked(pullVaultIfChanged).mockReturnValue(
        new Promise(() => {
          /* never resolves */
        }),
      );

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
      // Sync is in flight, not yet settled.
      expect(useSyncStore.getState().status).toBe("syncing");
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
        bootState: { kind: "unknown" },
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

    it("transitions to needs-onboarding (modal takes over from here) on a healthy environment", async () => {
      // Previous behavior auto-generated a passphrase and initialized
      // a local-only DB without ever surfacing the modal — meaning every
      // new user ended up local-only with a passphrase they'd never see.
      // The fix: the action only runs the secure-context guard; the modal
      // drives the actual choice (local / sync / recovery) and calls
      // initialize() once the user has chosen.
      await useAppStore.getState().startNewUserOnboarding();

      expect(initFresh).not.toHaveBeenCalled();
      const state = useAppStore.getState();
      expect(state.bootState.kind).toBe("needs-onboarding");
      expect(state.isDbReady).toBe(false);
      expect(state.hasCompletedOnboarding).toBe(false);
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

    it("does NOT call initFresh — passphrase generation + DB init are the modal's job", async () => {
      // Lock the structural property that motivated the refactor: this
      // action no longer creates a DB silently. Any future caller that
      // accidentally re-adds an initialize() here will trip this test
      // before reaching production (and shipping every new user into
      // local-only mode with a passphrase they can't see).
      await useAppStore.getState().startNewUserOnboarding();
      expect(initFresh).not.toHaveBeenCalled();
    });
  });
});
