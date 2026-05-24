import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/key-manager", () => ({
  initFresh: vi.fn().mockResolvedValue({
    ok: true,
    value: { credentials: null },
  }),
  restore: vi.fn().mockResolvedValue({ status: "no-keys" }),
  destroy: vi.fn().mockResolvedValue(undefined),
  addVaultKeys: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      vaultId: "mock-vault-id",
      vaultKey: "mock-vault-key",
      kdfSpec: { kind: "pbkdf2-600k" },
    },
  }),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn(() => "carbon mango velvet prism"),
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
  deriveVaultId: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

// Onboarding completion runs initialize() -> usePreferencesStore.hydrate();
// stub the store so this file stays focused on onboarding behavior.
vi.mock("@/stores/preferences-store", () => ({
  usePreferencesStore: {
    getState: () => ({
      hydrate: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    }),
    setState: vi.fn(),
  },
}));

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

describe("OnboardingModal", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    useOnboardingStore.setState({
      step: "welcome",
      storageMode: null,
      generatedPassphrase: "",
      confirmationInput: "",
      confirmationError: null,
    });
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
    });
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("renders modal when onboarding not complete", () => {
    render(<OnboardingModal />);
    expect(screen.getByText("Welcome to FeedZero")).toBeInTheDocument();
  });

  it("does not render modal when onboarding complete", () => {
    useAppStore.setState({ hasCompletedOnboarding: true });
    render(<OnboardingModal />);
    expect(screen.queryByText("Welcome to FeedZero")).not.toBeInTheDocument();
  });

  it("shows welcome step initially", () => {
    render(<OnboardingModal />);
    expect(screen.getByText("Welcome to FeedZero")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /get started/i }),
    ).toBeInTheDocument();
  });

  it("advances from welcome to storage-choice on Get Started", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal />);

    await user.click(screen.getByRole("button", { name: /get started/i }));

    expect(screen.getByText(/where should we store/i)).toBeInTheDocument();
  });

  it("shows passphrase-display step after choosing sync", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal />);

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(
      screen.getByRole("radio", { name: /sync across devices/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(/your secret key/i)).toBeInTheDocument();
    expect(screen.getByText("carbon mango velvet prism")).toBeInTheDocument();
  });

  it("shows passphrase-confirm step after passphrase-display", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal />);

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(
      screen.getByRole("radio", { name: /sync across devices/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText(/confirm your secret key/i)).toBeInTheDocument();
  });

  it("completes onboarding flow for local-only path", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal />);

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(screen.getByRole("radio", { name: /local only/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Should trigger initialization
    await waitFor(() => {
      expect(useOnboardingStore.getState().step).toBe("initializing");
    });
  });

  it("completes onboarding flow for sync path", async () => {
    const user = userEvent.setup();
    render(<OnboardingModal />);

    // Welcome -> Storage Choice
    await user.click(screen.getByRole("button", { name: /get started/i }));
    // Select sync option
    await user.click(
      screen.getByRole("radio", { name: /sync across devices/i }),
    );
    // Continue to Passphrase Display
    await user.click(screen.getByRole("button", { name: /continue/i }));
    // Check saved checkbox
    await user.click(
      screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
    );
    // Continue to confirm
    await user.click(screen.getByRole("button", { name: /continue/i }));
    // Type passphrase
    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "carbon mango velvet prism",
    );
    // Confirm
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(useOnboardingStore.getState().step).toBe("initializing");
    });
  });

  describe("sync store integration", () => {
    it("sets sync store to synced after sync onboarding completes", async () => {
      const user = userEvent.setup();
      render(<OnboardingModal />);

      // Complete sync onboarding flow
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await user.click(
        screen.getByRole("radio", { name: /sync across devices/i }),
      );
      await user.click(screen.getByRole("button", { name: /continue/i }));
      await user.click(
        screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
      );
      await user.click(screen.getByRole("button", { name: /continue/i }));
      await user.type(
        screen.getByPlaceholderText(/enter your secret key/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /confirm/i }));

      // Wait for onboarding to complete
      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      // Sync store should be updated with credentials (not raw passphrase)
      const syncState = useSyncStore.getState();
      expect(syncState.status).toBe("synced");
      expect(syncState.credentials).not.toBeNull();
      expect(syncState.lastSyncedAt).not.toBeNull();
    });

    it("uses initFresh for local-only onboarding", async () => {
      const user = userEvent.setup();
      const { initFresh } = await import("@/core/storage/key-manager");
      render(<OnboardingModal />);

      await user.click(screen.getByRole("button", { name: /get started/i }));
      await user.click(screen.getByRole("radio", { name: /local only/i }));
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      // Should call initFresh with local mode (sync: false)
      expect(initFresh).toHaveBeenCalledWith(
        "carbon mango velvet prism",
        { sync: false },
      );
    });

    it("keeps sync store as local-only after local onboarding", async () => {
      const user = userEvent.setup();
      render(<OnboardingModal />);

      // Complete local-only onboarding flow
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await user.click(screen.getByRole("radio", { name: /local only/i }));
      await user.click(screen.getByRole("button", { name: /continue/i }));

      // Wait for onboarding to complete
      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      // Sync store should remain local-only
      const syncState = useSyncStore.getState();
      expect(syncState.status).toBe("local-only");
      expect(syncState.credentials).toBeNull();
    });
  });
});
