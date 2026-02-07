import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/db.ts", () => ({
  open: vi.fn().mockResolvedValue({ ok: true, value: true }),
  openWithKeys: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  deleteDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshAllFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn().mockResolvedValue({
    ok: true,
    value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] },
  }),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/core/storage/key-material", () => ({
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

vi.mock("@/core/storage/crypto.ts", () => ({
  importCryptoKey: vi.fn().mockResolvedValue("mock-vault-key"),
}));

import { pullVault, importVault } from "@/core/sync/sync-service";
import { refreshAllFeeds } from "@/core/feeds/feed-service";
import { loadStoredKeys } from "@/core/storage/key-material";

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

// Lazy import App so mocks are set up first
let App: typeof import("@/app").App;

describe("App sync-aware init", () => {
  beforeEach(async () => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.mocked(loadStoredKeys).mockReturnValue(null);
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: null,
    });
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
      dialogOpen: false,
    });
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });

    const mod = await import("@/app");
    App = mod.App;
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("initializes with DEFAULT_PASSPHRASE for local-only returning users", async () => {
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    // Should not touch sync store
    expect(useSyncStore.getState().status).toBe("local-only");
    expect(useSyncStore.getState().credentials).toBeNull();
  });

  it("auto-refreshes all feeds on app load for returning users", async () => {
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    // Observable: refreshAllFeeds is called after DB is ready
    await waitFor(() => {
      expect(refreshAllFeeds).toHaveBeenCalled();
    });
  });

  it("restores sync state for returning sync users with stored keys", async () => {
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
    localStorageMock.setItem("feedzero:onboarding-complete", "true");
    localStorageMock.setItem("feedzero:storage-mode", "sync");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    // Should restore sync store credentials from stored keys
    expect(useSyncStore.getState().credentials).not.toBeNull();
    expect(useSyncStore.getState().status).toBe("synced");
  });

  it("migrates legacy sync users with stored passphrase", async () => {
    localStorageMock.setItem("feedzero:onboarding-complete", "true");
    localStorageMock.setItem("feedzero:storage-mode", "sync");
    localStorageMock.setItem(
      "feedzero:sync-passphrase",
      "carbon mango velvet prism",
    );

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    expect(pullVault).toHaveBeenCalled();
    expect(importVault).toHaveBeenCalled();
  });
});
