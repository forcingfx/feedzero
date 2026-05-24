import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RecoveryStep } from "@/components/onboarding/steps/recovery-step";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/storage/key-manager", () => ({
  initFresh: vi.fn(),
  persistDerivedKeysFromOpenDb: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  updateStoredVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: undefined }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  recoverVault: vi
    .fn()
    .mockResolvedValue({ ok: false, error: "Not found" }),
  // Default: no-op (returns the same creds the caller passed in). The
  // recovery flow treats `upgradeVaultKdf` as best-effort, so this
  // covers all tests that don't specifically exercise the upgrade.
  upgradeVaultKdf: vi.fn().mockImplementation(
    async (_passphrase: string, current: unknown) =>
      ({ ok: true, value: current }),
  ),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
  checkVaultExists: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

import { initFresh } from "@/core/storage/key-manager";
import {
  recoverVault,
  importVault,
  checkVaultExists,
} from "@/core/sync/sync-service";

const FAKE_RECOVERED_CREDENTIALS = {
  vaultId: "mock-vault-id",
  vaultKey: "mock-vault-key" as unknown as CryptoKey,
  kdfSpec: { kind: "pbkdf2-600k" } as const,
};

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

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>,
  );
}

describe("RecoveryStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    useOnboardingStore.setState({
      step: "recovery",
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

  it("renders heading", () => {
    renderInDialog(<RecoveryStep />);
    expect(screen.getByText(/enter your recovery key/i)).toBeInTheDocument();
  });

  it("renders passphrase input", () => {
    renderInDialog(<RecoveryStep />);
    expect(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
    ).toBeInTheDocument();
  });

  it("renders Recover button that is disabled when input is empty", () => {
    renderInDialog(<RecoveryStep />);
    const button = screen.getByRole("button", { name: /recover/i });
    expect(button).toBeDisabled();
  });

  it("enables Recover button when passphrase is entered", async () => {
    const user = userEvent.setup();
    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "carbon mango velvet prism",
    );

    const button = screen.getByRole("button", { name: /recover/i });
    expect(button).toBeEnabled();
  });

  it("shows error when db open fails", async () => {
    const user = userEvent.setup();
    vi.mocked(recoverVault).mockResolvedValue({
      ok: true,
      value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
    });
    vi.mocked(initFresh).mockResolvedValue({
      ok: false,
      error: "Invalid passphrase",
    });

    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "wrong passphrase here now",
    );
    await user.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not initialize/i)).toBeInTheDocument();
    });
  });

  it("completes onboarding when passphrase is valid and vault exists", async () => {
    const user = userEvent.setup();
    vi.mocked(recoverVault).mockResolvedValue({
      ok: true,
      value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
    });
    vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: {
        credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
      },
    });
    vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "carbon mango velvet prism",
    );
    await user.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });
  });

  it("stores derived keys on recovery", async () => {
    const user = userEvent.setup();
    vi.mocked(recoverVault).mockResolvedValue({
      ok: true,
      value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
    });
    vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: {
        credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
      },
    });
    vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "carbon mango velvet prism",
    );
    await user.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });

    expect(initFresh).toHaveBeenCalledWith(
      "carbon mango velvet prism",
      { sync: true, skipServerCleanup: true, vaultKdfSpec: FAKE_RECOVERED_CREDENTIALS.kdfSpec },
    );
  });

  it("renders Back button that returns to storage-choice", async () => {
    const user = userEvent.setup();
    renderInDialog(<RecoveryStep />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(useOnboardingStore.getState().step).toBe("storage-choice");
  });

  describe("cloud pull recovery", () => {
    it("pulls vault from server and imports on successful recovery", async () => {
      const user = userEvent.setup();
      const vaultData = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [
          {
            id: "f1",
            url: "https://example.com/feed",
            title: "Test",
            description: "",
            siteUrl: "https://example.com",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        articles: [],
      };
      vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: {
        credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
      },
    });
      vi.mocked(recoverVault).mockResolvedValue({ ok: true, value: { vault: vaultData, credentials: FAKE_RECOVERED_CREDENTIALS } });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      // pullVault is called with derived credentials (not raw passphrase)
      expect(recoverVault).toHaveBeenCalled();
      expect(importVault).toHaveBeenCalledWith(vaultData);
    });

    it("sets sync store credentials after cloud pull recovery", async () => {
      const user = userEvent.setup();
      vi.mocked(initFresh).mockResolvedValue({
      ok: true,
      value: {
        credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
      },
    });
      vi.mocked(recoverVault).mockResolvedValue({
        ok: true,
        value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(useSyncStore.getState().credentials).not.toBeNull();
      });
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("pulls vault BEFORE calling initFresh (no destructive ops before read)", async () => {
      const user = userEvent.setup();
      const callOrder: string[] = [];
      vi.mocked(recoverVault).mockImplementation(async () => {
        callOrder.push("recoverVault");
        return {
          ok: true,
          value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
        };
      });
      vi.mocked(initFresh).mockImplementation(async () => {
        callOrder.push("initFresh");
        return {
          ok: true,
          value: {
            credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
          },
        };
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });

      expect(callOrder).toEqual(["recoverVault", "initFresh"]);
    });

    it("calls initFresh with skipServerCleanup during recovery", async () => {
      const user = userEvent.setup();
      vi.mocked(recoverVault).mockResolvedValue({
        ok: true,
        value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
      });
      vi.mocked(initFresh).mockResolvedValue({
        ok: true,
        value: {
          credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
        },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(initFresh).toHaveBeenCalledWith(
          "carbon mango velvet prism",
          { sync: true, skipServerCleanup: true, vaultKdfSpec: FAKE_RECOVERED_CREDENTIALS.kdfSpec },
        );
      });
    });

    it("initializes with sync mode and skipServerCleanup for cloud recovery", async () => {
      const user = userEvent.setup();
      vi.mocked(initFresh).mockResolvedValue({
        ok: true,
        value: {
          credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
        },
      });
      vi.mocked(recoverVault).mockResolvedValue({
        ok: true,
        value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(initFresh).toHaveBeenCalledWith(
          "carbon mango velvet prism",
          { sync: true, skipServerCleanup: true, vaultKdfSpec: FAKE_RECOVERED_CREDENTIALS.kdfSpec },
        );
      });
    });

    it("shows Enter kbd hint on Recover button", () => {
      renderInDialog(<RecoveryStep />);
      const button = screen.getByRole("button", { name: /^recover$/i });
      expect(button.querySelector("kbd")).toHaveTextContent("Enter");
    });

    it("submits on Enter key in input field", async () => {
      const user = userEvent.setup();
      vi.mocked(recoverVault).mockResolvedValue({
        ok: true,
        value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
      });
      vi.mocked(initFresh).mockResolvedValue({
        ok: true,
        value: {
          credentials: { vaultId: "mock-vault-id", vaultKey: "mock-vault-key" as unknown as CryptoKey, kdfSpec: { kind: "pbkdf2-600k" } },
        },
      });
      vi.mocked(importVault).mockResolvedValue({ ok: true, value: true });

      renderInDialog(<RecoveryStep />);

      const input = screen.getByPlaceholderText(
        /enter your 4-word passphrase/i,
      );
      await user.type(input, "carbon mango velvet prism{Enter}");

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });
    });

    it("shows error and does not complete onboarding when pull fails", async () => {
      const user = userEvent.setup();
      vi.mocked(recoverVault).mockResolvedValue({
        ok: false,
        error: "Sync pull failed (404): Not found",
      });

      renderInDialog(<RecoveryStep />);

      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/could not find a vault/i),
        ).toBeInTheDocument();
      });

      // Onboarding should NOT complete — no silent data loss
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
      // initFresh should NOT have been called — no destructive action taken
      expect(initFresh).not.toHaveBeenCalled();
    });
  });

  describe("HEAD-first vault detection (ADR 014 A8)", () => {
    it("calls checkVaultExists BEFORE pullVault — HEAD precedes GET", async () => {
      const user = userEvent.setup();
      const callOrder: string[] = [];
      vi.mocked(checkVaultExists).mockImplementation(async () => {
        callOrder.push("checkVaultExists");
        return { ok: true, value: true };
      });
      vi.mocked(recoverVault).mockImplementation(async () => {
        callOrder.push("recoverVault");
        return {
          ok: true,
          value: { vault: { version: 1, exportedAt: Date.now(), feeds: [], articles: [] }, credentials: FAKE_RECOVERED_CREDENTIALS },
        };
      });
      vi.mocked(initFresh).mockResolvedValue({
        ok: true,
        value: {
          credentials: {
            vaultId: "v",
            vaultKey: "k" as unknown as CryptoKey,
            kdfSpec: { kind: "pbkdf2-600k" } as const,
          },
        },
      });

      renderInDialog(<RecoveryStep />);
      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
      });
      // HEAD before GET — cheaper failure when the passphrase is wrong,
      // and lets the UI distinguish "checking" from "restoring."
      expect(callOrder).toEqual(["checkVaultExists", "recoverVault"]);
    });

    it("short-circuits when checkVaultExists returns false — no pullVault, no initFresh", async () => {
      const user = userEvent.setup();
      vi.mocked(checkVaultExists).mockResolvedValue({
        ok: true,
        value: false,
      });

      renderInDialog(<RecoveryStep />);
      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "wrong passphrase guessed here",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/no vault matched that passphrase/i),
        ).toBeInTheDocument();
      });

      // The whole point: bail before the destructive flow.
      expect(recoverVault).not.toHaveBeenCalled();
      expect(initFresh).not.toHaveBeenCalled();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    });

    it("surfaces the network error when checkVaultExists itself fails", async () => {
      // A real failure (5xx, network, CORS) is different from "no vault."
      // The user shouldn't be told to check their passphrase when the
      // server is the problem.
      const user = userEvent.setup();
      vi.mocked(checkVaultExists).mockResolvedValue({
        ok: false,
        error: "Check vault failed (503): backend overloaded",
      });

      renderInDialog(<RecoveryStep />);
      await user.type(
        screen.getByPlaceholderText(/enter your 4-word passphrase/i),
        "carbon mango velvet prism",
      );
      await user.click(screen.getByRole("button", { name: /recover/i }));

      await waitFor(() => {
        expect(screen.getByText(/backend overloaded/i)).toBeInTheDocument();
      });
      expect(recoverVault).not.toHaveBeenCalled();
      expect(initFresh).not.toHaveBeenCalled();
    });
  });
});
