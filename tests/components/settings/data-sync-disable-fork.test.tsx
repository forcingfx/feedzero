/**
 * <DataSyncSection> disable-sync fork — two destructive CTAs (Keep cloud
 * store | Delete cloud store forever) with very different blast radii.
 *
 * Reached by flipping the Cloud sync toggle OFF when sync is already on
 * (post-redesign — the dedicated "Switch to local only" button is gone).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DataSyncSection } from "@/components/settings/data-sync-section";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
  deleteVault: vi.fn(),
  exportVault: vi.fn(),
  mergeVaults: vi.fn(),
}));
vi.mock("@/core/storage/key-manager", () => ({
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  persistDerivedKeysFromOpenDb: vi.fn(),
}));
vi.mock("@/core/sync/vault-crypto", () => ({
  deriveVaultId: vi.fn(),
  deriveVaultKey: vi.fn(),
}));
vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn().mockResolvedValue("alpha bravo charlie delta"),
}));

import { deleteVault as deleteVaultMock } from "@/core/sync/sync-service";

const mockCredentials = {
  vaultId: "test-vault-id",
  vaultKey: "test-vault-key" as unknown as CryptoKey,
  kdfSpec: { kind: "pbkdf2-600k" } as const,
};

function renderSection() {
  return render(
    <MemoryRouter>
      <DataSyncSection />
    </MemoryRouter>,
  );
}

describe("<DataSyncSection> disable-sync fork", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: [] });
    useLicenseStore.setState({ tier: "personal", verifying: false });
    useSyncStore.setState({
      status: "synced",
      credentials: mockCredentials,
      error: null,
    });
    vi.mocked(deleteVaultMock).mockReset();
  });

  it("flipping the toggle OFF opens a fork with TWO distinct CTAs", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(
      screen.getByRole("switch", { name: /toggle cloud sync/i }),
    );

    expect(
      screen.getByRole("button", { name: /^keep cloud store$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete cloud store forever/i }),
    ).toBeInTheDocument();
  });

  it("'Keep cloud store' disables locally without calling the server delete endpoint", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(
      screen.getByRole("switch", { name: /toggle cloud sync/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /^keep cloud store$/i }),
    );

    await waitFor(() => {
      expect(useSyncStore.getState().status).toBe("local-only");
    });
    expect(deleteVaultMock).not.toHaveBeenCalled();
  });

  it("'Delete cloud store forever' deletes the server vault THEN disables sync", async () => {
    vi.mocked(deleteVaultMock).mockResolvedValue({ ok: true, value: true });
    const user = userEvent.setup();
    renderSection();
    await user.click(
      screen.getByRole("switch", { name: /toggle cloud sync/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /delete cloud store forever/i }),
    );

    await waitFor(() => {
      expect(deleteVaultMock).toHaveBeenCalledWith(mockCredentials);
    });
    await waitFor(() => {
      expect(useSyncStore.getState().status).toBe("local-only");
    });
  });

  it("if vault deletion fails, sync stays ON locally and an inline retry message appears", async () => {
    vi.mocked(deleteVaultMock).mockResolvedValue({
      ok: false,
      error: "network",
    });
    const user = userEvent.setup();
    renderSection();
    await user.click(
      screen.getByRole("switch", { name: /toggle cloud sync/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /delete cloud store forever/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/couldn't delete cloud store/i)).toBeInTheDocument();
    });
    // Sync is still on locally — disable was NOT applied after the failure.
    expect(useSyncStore.getState().status).toBe("synced");
    expect(useSyncStore.getState().credentials).toEqual(mockCredentials);
  });
});
