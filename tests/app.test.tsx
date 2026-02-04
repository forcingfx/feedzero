import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/db.ts", () => ({
  open: vi.fn().mockResolvedValue({ ok: true, value: true }),
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

import { pullVault, importVault } from "@/core/sync/sync-service";

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
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: null,
    });
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      passphrase: null,
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
    expect(useSyncStore.getState().passphrase).toBeNull();
  });

  it("restores sync state and uses stored passphrase for returning sync users", async () => {
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

    // Should restore sync store state
    expect(useSyncStore.getState().passphrase).toBe(
      "carbon mango velvet prism",
    );
    expect(useSyncStore.getState().status).toBe("synced");
  });

  it("pulls vault on startup for returning sync users", async () => {
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

    expect(pullVault).toHaveBeenCalledWith("carbon mango velvet prism");
    expect(importVault).toHaveBeenCalled();
  });
});
