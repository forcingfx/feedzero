import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncSetupDialog } from "@/components/sync/sync-setup-dialog";
import { useSyncStore } from "@/stores/sync-store";
import { useAppStore } from "@/stores/app-store";

vi.mock("@/core/storage/db", () => ({
  deleteDatabase: vi.fn().mockResolvedValue({ ok: true }),
  getSalt: vi
    .fn()
    .mockResolvedValue({ ok: true, value: new Uint8Array([1, 2, 3]) }),
  exportCurrentKeys: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      dbKeyJwk: { kty: "oct", k: "db-key" },
      hmacKeyJwk: { kty: "oct", k: "hmac-key" },
    },
  }),
  // forceResync's UI-refresh path lazy-imports feed-store + article-store,
  // which call into the db layer. Stubs below let those calls complete
  // cleanly without booting fake-indexeddb.
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/storage/crypto", () => ({
  exportCryptoKey: vi.fn().mockResolvedValue({ kty: "oct", k: "vault-key" }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn().mockResolvedValue({ ok: false, error: "Not found" }),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn(() => "alpha bravo charlie delta"),
}));

vi.mock("@/core/sync/vault-crypto", () => ({
  deriveVaultId: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-id" }),
  deriveVaultKey: vi
    .fn()
    .mockResolvedValue({ ok: true, value: "mock-vault-key" }),
}));

vi.mock("@/core/storage/key-material", () => ({
  deriveAndStoreKeys: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  clearStoredKeys: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

const mockCredentials = {
  vaultId: "mock-vault-id",
  vaultKey: "mock-vault-key" as unknown as CryptoKey,
};

describe("SyncSetupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
      credentials: mockCredentials,
      dialogOpen: true,
    });
    useAppStore.setState({
      isDbReady: true,
      error: null,
      hasCompletedOnboarding: true,
    });
  });

  describe("StatusDialog state management", () => {
    it("shows normal state when dialog opens (not deleting state)", () => {
      render(<SyncSetupDialog />);

      // Should show the normal "Delete all data" button, not "Deleting..."
      expect(
        screen.getByRole("button", { name: /delete all data/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/deleting/i)).not.toBeInTheDocument();
    });

    it("resets to normal state when dialog is closed and reopened", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<SyncSetupDialog />);

      // Click delete button to go to confirm view
      await user.click(
        screen.getByRole("button", { name: /delete all data/i }),
      );

      // Should show confirmation dialog
      expect(screen.getByText(/delete all data\?/i)).toBeInTheDocument();

      // Close dialog
      useSyncStore.setState({ dialogOpen: false });
      rerender(<SyncSetupDialog />);

      // Reopen dialog
      useSyncStore.setState({ dialogOpen: true });
      rerender(<SyncSetupDialog />);

      // Should be back to normal state, not confirmation view
      expect(screen.queryByText(/delete all data\?/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete all data/i }),
      ).toBeInTheDocument();
    });

    it("does not show spinner when dialog first opens", () => {
      render(<SyncSetupDialog />);

      // Click to show confirmation
      // The spinner should never be visible on first open
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBe(0);
    });
  });

  describe("enable sync from local-only", () => {
    beforeEach(() => {
      useSyncStore.setState({
        status: "local-only",
        credentials: null,
        dialogOpen: true,
      });
    });

    it("shows Enable sync button for local-only users", () => {
      render(<SyncSetupDialog />);
      expect(
        screen.getByRole("button", { name: /enable sync/i }),
      ).toBeInTheDocument();
    });

    it("clicking Enable sync shows the passphrase setup flow", async () => {
      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(screen.getByRole("button", { name: /enable sync/i }));

      // Should show the passphrase generation step
      expect(screen.getByText("Your secret key")).toBeInTheDocument();
      expect(screen.getByText("alpha bravo charlie delta")).toBeInTheDocument();
    });
  });

  describe("disable sync from synced", () => {
    beforeEach(() => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
        dialogOpen: true,
      });
    });

    it("shows Switch to local only button for synced users", () => {
      render(<SyncSetupDialog />);
      expect(
        screen.getByRole("button", { name: /switch to local only/i }),
      ).toBeInTheDocument();
    });

    it("clicking Switch to local only shows confirmation", async () => {
      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(
        screen.getByRole("button", { name: /switch to local only/i }),
      );

      expect(
        screen.getByText(/delete your encrypted data from the server/i),
      ).toBeInTheDocument();
    });

    it("confirming disable sync calls disableSync and closes dialog", async () => {
      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(
        screen.getByRole("button", { name: /switch to local only/i }),
      );
      await user.click(screen.getByRole("button", { name: /disable sync/i }));

      // Store should be back to local-only
      expect(useSyncStore.getState().status).toBe("local-only");
    });
  });

  describe("logout confirmation", () => {
    beforeEach(() => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
        dialogOpen: true,
      });
    });

    it("warns user they will need their secret key to access feeds again", async () => {
      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(
        screen.getByRole("button", { name: /log out of this device/i }),
      );

      expect(
        screen.getByText(/you will need your secret key/i),
      ).toBeInTheDocument();
    });
  });

  describe("syncing status", () => {
    it("disables Switch to local only while syncing", () => {
      useSyncStore.setState({
        status: "syncing",
        credentials: mockCredentials,
        dialogOpen: true,
      });

      render(<SyncSetupDialog />);

      const button = screen.getByRole("button", {
        name: /switch to local only/i,
      });
      expect(button).toBeDisabled();
    });
  });

  describe("restore from cloud", () => {
    beforeEach(() => {
      useSyncStore.setState({
        status: "synced",
        credentials: mockCredentials,
        lastSyncedAt: Date.now(),
        dialogOpen: true,
      });
    });

    it("shows Restore from cloud button for synced users", () => {
      render(<SyncSetupDialog />);
      expect(
        screen.getByRole("button", { name: /restore from cloud/i }),
      ).toBeInTheDocument();
    });

    it("clicking Restore from cloud shows a confirmation explaining the replace", async () => {
      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(
        screen.getByRole("button", { name: /restore from cloud/i }),
      );

      expect(
        screen.getByText(/replace your local feeds and articles/i),
      ).toBeInTheDocument();
    });

    it("disables Restore from cloud while syncing", () => {
      useSyncStore.setState({
        status: "syncing",
        credentials: mockCredentials,
        dialogOpen: true,
      });

      render(<SyncSetupDialog />);

      const button = screen.getByRole("button", {
        name: /restore from cloud/i,
      });
      expect(button).toBeDisabled();
    });

    it("confirming restore pulls the vault and closes the dialog on success", async () => {
      const { pullVault } = await import("@/core/sync/sync-service");
      vi.mocked(pullVault).mockResolvedValue({
        ok: true,
        value: {
          version: 1,
          exportedAt: Date.now(),
          feeds: [
            {
              id: "f1",
              url: "https://example.com",
              title: "Example",
              description: "",
              siteUrl: "",
              createdAt: 0,
              updatedAt: 0,
            },
          ],
          articles: [],
        },
      });

      const user = userEvent.setup();
      render(<SyncSetupDialog />);

      await user.click(
        screen.getByRole("button", { name: /restore from cloud/i }),
      );
      // Confirm button inside the confirmation view
      await user.click(
        screen.getByRole("button", { name: /^restore$/i }),
      );

      // Dialog should close on success
      expect(useSyncStore.getState().dialogOpen).toBe(false);
      // Status should be back to synced after the import completes
      expect(useSyncStore.getState().status).toBe("synced");
    });
  });
});
