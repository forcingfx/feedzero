import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncSetupDialog } from "@/components/sync/sync-setup-dialog";
import { useSyncStore } from "@/stores/sync-store";
import { useAppStore } from "@/stores/app-store";

vi.mock("@/core/storage/db", () => ({
  deleteDatabase: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn().mockResolvedValue({ ok: false, error: "Not found" }),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("SyncSetupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({
      status: "synced",
      lastSyncedAt: Date.now(),
      error: null,
      passphrase: "test passphrase",
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
});
