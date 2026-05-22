import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/key-manager", () => ({
  initFresh: vi.fn().mockResolvedValue({
    ok: true,
    value: { credentials: null },
  }),
  restore: vi.fn().mockResolvedValue({
    status: "ready",
    isSyncUser: false,
    credentials: null,
  }),
  destroy: vi.fn().mockResolvedValue(undefined),
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi.fn().mockResolvedValue({ ok: true, value: {} }),
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
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/core/sync/vault-crypto", () => ({
  deriveVaultId: vi.fn().mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi.fn().mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

// Boot calls usePreferencesStore.hydrate(); stub the store so this file
// stays focused on app init wiring rather than preferences persistence.
vi.mock("@/stores/preferences-store", () => ({
  usePreferencesStore: {
    getState: () => ({
      hydrate: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    }),
    setState: vi.fn(),
  },
}));

import { addFeedFlow, refreshAllFeeds } from "@/core/feeds/feed-service";
import { restore } from "@/core/storage/key-manager";
import { CHANGELOG_FEED_URL } from "@/utils/constants";

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
      credentials: null,
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

  it("initializes for local-only returning users", async () => {
    vi.mocked(restore).mockResolvedValue({
      status: "ready",
      isSyncUser: false,
      credentials: null,
    });
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    expect(useSyncStore.getState().status).toBe("local-only");
  });

  it("auto-refreshes all feeds on app load for returning users", async () => {
    vi.mocked(restore).mockResolvedValue({
      status: "ready",
      isSyncUser: false,
      credentials: null,
    });
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    await waitFor(() => {
      expect(refreshAllFeeds).toHaveBeenCalled();
    });
  });

  it("restores sync state for returning sync users", async () => {
    const mockCredentials = {
      vaultId: "stored-vault-id",
      vaultKey: "mock-key" as unknown as CryptoKey,
    };
    vi.mocked(restore).mockResolvedValue({
      status: "ready",
      isSyncUser: true,
      credentials: mockCredentials,
    });
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    expect(useSyncStore.getState().credentials).not.toBeNull();
    expect(useSyncStore.getState().status).toBe("synced");
  });

  it("shows error when new-user initialization fails", async () => {
    // New user — onboarding not complete
    useAppStore.setState({ hasCompletedOnboarding: false });

    const { initFresh } = await import("@/core/storage/key-manager");
    vi.mocked(initFresh).mockResolvedValueOnce({
      ok: false,
      error: "Web Crypto unavailable",
    });

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().error).toBeTruthy();
    });
  });

  it("auto-subscribes new users to the release notes feed on first launch", async () => {
    // The app calls addFeed(CHANGELOG_FEED_URL) when isDbReady and
    // feeds.length === 0. This is the first-launch auto-subscribe flow
    // that populates the sidebar with the release notes feed so users
    // see "What's new" immediately.
    vi.mocked(restore).mockResolvedValue({
      status: "ready",
      isSyncUser: false,
      credentials: null,
    });
    vi.mocked(addFeedFlow).mockResolvedValue({
      ok: true,
      value: {
        feed: {
          id: "release",
          url: CHANGELOG_FEED_URL,
          title: "FeedZero Release Notes",
          description: "",
          siteUrl: "https://feedzero.app/releases/",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        articles: [],
      },
    });
    localStorageMock.setItem("feedzero:onboarding-complete", "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().isDbReady).toBe(true);
    });

    await waitFor(() => {
      expect(addFeedFlow).toHaveBeenCalledWith(
        CHANGELOG_FEED_URL,
        expect.objectContaining({ bridgesEnabled: expect.any(Boolean) }),
      );
    });
  });

  it("shows the secure-context guidance screen when isSecureContext is false", async () => {
    // Self-host scenario from feedback #88: user loads the app over plain
    // HTTP from a LAN IP. The pre-fix code showed a misleading "iOS
    // Lockdown Mode" error; the new screen names the real cause (no
    // secure context) and points the user at the self-hosting guide.
    const original = globalThis.isSecureContext;
    Object.defineProperty(globalThis, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    });

    useAppStore.setState({ hasCompletedOnboarding: false });

    const { findByText } = render(<App />);
    expect(await findByText(/secure context|HTTPS/i)).toBeInTheDocument();

    Object.defineProperty(globalThis, "isSecureContext", {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it("shows the crypto-missing screen when subtle is unavailable but context is secure (Lockdown Mode)", async () => {
    const originalSubtle = globalThis.crypto?.subtle;
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: undefined,
      configurable: true,
    });

    useAppStore.setState({ hasCompletedOnboarding: false });

    const { findByText } = render(<App />);
    expect(await findByText(/Web Crypto|Lockdown/i)).toBeInTheDocument();

    Object.defineProperty(globalThis.crypto, "subtle", {
      value: originalSubtle,
      configurable: true,
    });
  });
});
