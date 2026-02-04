import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "../../src/stores/app-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  open: vi.fn(),
  deleteDatabase: vi.fn(),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { open } from "../../src/core/storage/db.ts";
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
        passphrase: null,
        lastSyncedAt: null,
        error: null,
      });
    });

    it("initializes with default passphrase for local-only users", async () => {
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("feedzero-default-key");
      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().status).toBe("local-only");
    });

    it("initializes with stored passphrase for local-only users when persisted", async () => {
      localStorageMock.setItem("feedzero:storage-mode", "local");
      localStorageMock.setItem("feedzero:sync-passphrase", "random local key");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("random local key");
      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().status).toBe("local-only");
    });

    it("initializes with stored passphrase and pulls for sync users", async () => {
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(pullVault).mockResolvedValue({
        ok: true,
        value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      await useAppStore.getState().initializeReturningUser();

      expect(open).toHaveBeenCalledWith("test phrase");
      expect(pullVault).toHaveBeenCalledWith("test phrase");
      expect(importVault).toHaveBeenCalled();
      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().status).toBe("synced");
      expect(useSyncStore.getState().passphrase).toBe("test phrase");
    });

    it("still initializes DB when sync pull fails", async () => {
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(pullVault).mockResolvedValue({
        ok: false,
        error: "Not found",
      });

      await useAppStore.getState().initializeReturningUser();

      expect(useAppStore.getState().isDbReady).toBe(true);
      expect(useSyncStore.getState().passphrase).toBe("test phrase");
    });

    it("preserves error status when sync pull fails instead of overriding to synced", async () => {
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      localStorageMock.setItem("feedzero:sync-passphrase", "test phrase");
      vi.mocked(open).mockResolvedValue({ ok: true, value: true });
      vi.mocked(pullVault).mockResolvedValue({
        ok: false,
        error: "Sync pull failed (404): Vault not found",
      });

      await useAppStore.getState().initializeReturningUser();

      const syncState = useSyncStore.getState();
      expect(syncState.status).toBe("error");
      expect(syncState.error).toBe("Sync pull failed (404): Vault not found");
    });
  });
});
