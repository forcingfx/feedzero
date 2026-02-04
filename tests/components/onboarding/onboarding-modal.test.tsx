import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/db.ts", () => ({
  open: vi.fn().mockResolvedValue({ ok: true, value: true }),
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
      passphrase: null,
      dialogOpen: false,
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

      // Sync store should be updated
      const syncState = useSyncStore.getState();
      expect(syncState.status).toBe("synced");
      expect(syncState.passphrase).toBe("carbon mango velvet prism");
      expect(syncState.lastSyncedAt).not.toBeNull();
    });

    it("persists passphrase and storage mode to localStorage for local-only onboarding", async () => {
      const user = userEvent.setup();
      render(<OnboardingModal />);

      await user.click(screen.getByRole("button", { name: /get started/i }));
      await user.click(screen.getByRole("radio", { name: /local only/i }));
      await user.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:sync-passphrase",
        "carbon mango velvet prism",
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
        "local",
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
      expect(syncState.passphrase).toBeNull();
    });
  });
});
