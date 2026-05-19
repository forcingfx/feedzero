import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvalidKeysScreen } from "@/components/recovery/invalid-keys-screen";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";

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

describe("InvalidKeysScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    useAppStore.setState({
      isDbReady: false,
      error: null,
      recoveryMode: "invalid-keys",
      hasCompletedOnboarding: true,
    });
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      credentials: null,
    });
  });

  it("offers both 'restore from cloud' and 'wipe' paths without auto-deleting anything", () => {
    render(<InvalidKeysScreen />);

    // The whole point of issue #117's fix: deletion is the user's call,
    // not the boot code's. So this screen MUST surface both choices.
    expect(screen.getByLabelText(/restore from cloud/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /wipe this device/i }),
    ).toBeInTheDocument();
  });

  it("calls switchToExistingCloud('replace') and clears recoveryMode on successful restore", async () => {
    const user = userEvent.setup();
    const switchToExistingCloud = vi
      .fn()
      .mockResolvedValue({ ok: true, value: true });
    useSyncStore.setState({ switchToExistingCloud });

    render(<InvalidKeysScreen />);

    const input = screen.getByLabelText(/restore from cloud/i);
    await user.type(input, "alpha bravo charlie delta");
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(switchToExistingCloud).toHaveBeenCalledWith(
        "alpha bravo charlie delta",
        "replace",
      );
    });
    await waitFor(() => {
      expect(useAppStore.getState().recoveryMode).toBeNull();
      expect(useAppStore.getState().isDbReady).toBe(true);
    });
  });

  it("surfaces a friendly error when the passphrase has no cloud vault", async () => {
    const user = userEvent.setup();
    const switchToExistingCloud = vi.fn().mockResolvedValue({
      ok: false,
      error: "No cloud vault was found for this passphrase.",
    });
    useSyncStore.setState({ switchToExistingCloud });

    render(<InvalidKeysScreen />);

    await user.type(
      screen.getByLabelText(/restore from cloud/i),
      "wrong words here please",
    );
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    expect(
      await screen.findByText(
        /No vault found for that passphrase\. Double-check every word\./i,
      ),
    ).toBeInTheDocument();
    expect(useAppStore.getState().recoveryMode).toBe("invalid-keys");
    expect(useAppStore.getState().isDbReady).toBe(false);
  });

  it("requires explicit confirmation before wiping (destroy is gated by AlertDialog)", async () => {
    const user = userEvent.setup();
    const resetApp = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ resetApp });

    render(<InvalidKeysScreen />);

    // First click opens the confirmation dialog; resetApp must NOT have
    // been called yet. This is the structural barrier against issue
    // #117's auto-destroy bug.
    await user.click(
      screen.getByRole("button", { name: /wipe this device/i }),
    );
    expect(resetApp).not.toHaveBeenCalled();

    // Only after explicitly clicking "Wipe everything" does the
    // destructive action fire.
    await user.click(screen.getByRole("button", { name: /wipe everything/i }));
    await waitFor(() => {
      expect(resetApp).toHaveBeenCalledOnce();
    });
  });
});
