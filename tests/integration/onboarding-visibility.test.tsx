/**
 * Onboarding visibility — the regression test for the
 * "modal never appeared, every new user got a silent local-only DB
 * with a passphrase they couldn't see" bug. Fixed in `a27397d`.
 *
 * Why this test exists: the unit-level tests were all green when the
 * bug shipped because they each tested isolated pieces correctly
 * (`startNewUserOnboarding` did create a DB; the modal did render
 * when its step state said so; `initialize` did finish). The bug
 * lived in how they composed — the action ran fast enough that
 * `hasCompletedOnboarding` flipped true before the modal mounted.
 *
 * This test asks the *user's* question: "when I, a never-onboarded
 * person, open the app, do I see the welcome screen?" That question
 * isn't askable in any unit test because it requires the whole tree
 * mounted with the actual boot sequence running. The mock surface
 * here is intentionally the *boundary* (key-manager, sync-service)
 * rather than the collaborators — mocking initialize() or the modal
 * would let the same bug-class leak through again.
 *
 * Per CLAUDE.md's "Test behavior, not implementation" rule. The
 * 2026-05-19 destroy-cascade incident report names this exactly:
 * "the test asserted destroy was called — verifying the bug as a
 * feature." This is the structural fix at the test layer.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

// Boundary mocks ONLY — the network, the IndexedDB key layer, and the
// preferences hydrate path. The app-store, onboarding-store, modal
// component, and AppInit all run real so the composition under test
// is what production renders.
vi.mock("@/core/storage/key-manager", () => ({
  initFresh: vi.fn().mockResolvedValue({
    ok: true,
    value: { credentials: null },
  }),
  restore: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn().mockResolvedValue({ ok: true, value: { feed: null, articles: [] } }),
  refreshAllFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: { updatedAt: Date.now(), etag: null } }),
  pullVault: vi.fn().mockResolvedValue({ ok: true, value: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] } }),
  pullVaultIfChanged: vi.fn().mockResolvedValue({
    ok: true,
    value: { notModified: false, vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, etag: null },
  }),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/stores/preferences-store", () => ({
  usePreferencesStore: {
    getState: () => ({
      hydrate: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    }),
    setState: vi.fn(),
  },
}));

import { restore } from "@/core/storage/key-manager";

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

let App: typeof import("@/app").App;

describe("onboarding visibility", () => {
  beforeEach(async () => {
    localStorageMock.clear();
    vi.clearAllMocks();
    useAppStore.setState({
      bootState: { kind: "unknown" },
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: null,
      recoveryMode: null,
      securityProblem: null,
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
    useOnboardingStore.getState().reset();

    const mod = await import("@/app");
    App = mod.App;
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("shows the welcome step to a never-onboarded user", async () => {
    // The user-observable contract: a fresh browser (no ONBOARDING_KEY
    // in localStorage) shows the welcome screen. If this test fails,
    // the auto-onboarding regression has returned and every new user
    // is being silently routed into a local-only DB.
    render(<App />);

    expect(
      await screen.findByText(/welcome to feedzero/i),
    ).toBeInTheDocument();
  });

  it("does NOT show the welcome step to a returning user", async () => {
    // The negative control: an already-onboarded user must never see
    // the modal. If this fails, the modal is leaking into normal use.
    vi.mocked(restore).mockResolvedValue({
      status: "ready",
      isSyncUser: false,
      credentials: null,
    });
    localStorageMock.setItem(ONBOARDING_KEY, "true");

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().bootState.kind).toBe("ready");
    });
    expect(
      screen.queryByText(/welcome to feedzero/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT mark onboarding complete until the user finishes the modal", async () => {
    // The bug we shipped: startNewUserOnboarding silently wrote
    // ONBOARDING_KEY = "true" on first launch, so the modal was
    // immediately dismissed by its own `isOpen = hasCompleted === false`
    // gate. This lock asserts the flag does NOT flip until the user
    // explicitly completes onboarding.
    render(<App />);

    // Wait long enough for any background action to have stamped the
    // flag — if startNewUserOnboarding reverts to auto-completing,
    // this trips.
    await screen.findByText(/welcome to feedzero/i);
    expect(localStorageMock.getItem(ONBOARDING_KEY)).toBeNull();
    expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
  });
});
