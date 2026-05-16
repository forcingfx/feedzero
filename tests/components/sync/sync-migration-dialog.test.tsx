import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SyncMigrationDialog } from "@/components/sync/sync-migration-dialog";
import { useSyncStore } from "@/stores/sync-store";

// Minimal sync-service mocks — the dialog itself does not call sync-service,
// but the store imports it, and importing the store at module-load triggers
// the type wiring. Stubs keep the test isolated from the network layer.
vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn().mockResolvedValue({ ok: false, error: "Not found" }),
  importVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
  deleteVault: vi.fn().mockResolvedValue({ ok: true, value: true }),
  exportVault: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  mergeVaults: vi.fn().mockReturnValue({ ok: true, value: {} }),
}));

vi.mock("@/core/storage/key-manager", () => ({
  addVaultKeys: vi.fn(),
  removeVaultKeys: vi.fn(),
  destroyLocal: vi.fn().mockResolvedValue(undefined),
  rekeyFromPassphrase: vi.fn(),
}));

vi.mock("@/core/sync/vault-crypto", () => ({
  deriveVaultId: vi.fn(),
  deriveVaultKey: vi.fn(),
}));

function renderDialog() {
  return render(
    <MemoryRouter>
      <SyncMigrationDialog />
    </MemoryRouter>,
  );
}

describe("SyncMigrationDialog", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      credentials: null,
      pendingMigration: null,
      error: null,
    });
  });

  it("renders nothing when pendingMigration is null", () => {
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog when pendingMigration === 'license-required'", () => {
    useSyncStore.setState({ pendingMigration: "license-required" });
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Headline communicates the new reality, not a generic error
    expect(
      screen.getByText(/cloud sync .* (paid|personal)/i),
    ).toBeInTheDocument();
  });

  it("informs the user that the cloud vault is preserved for 90 days", () => {
    useSyncStore.setState({ pendingMigration: "license-required" });
    renderDialog();
    expect(screen.getByText(/90 days/i)).toBeInTheDocument();
  });

  it("'Keep reading locally' calls migrateToLocalOnly and clears pendingMigration", async () => {
    const user = userEvent.setup();
    useSyncStore.setState({ pendingMigration: "license-required" });
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: /keep reading locally/i }),
    );

    expect(useSyncStore.getState().pendingMigration).toBeNull();
    expect(useSyncStore.getState().status).toBe("local-only");
    expect(useSyncStore.getState().credentials).toBeNull();
  });

  it("offers a Subscribe link pointing at the Personal monthly deeplink", () => {
    useSyncStore.setState({ pendingMigration: "license-required" });
    renderDialog();
    const subscribe = screen.getByRole("link", { name: /subscribe/i });
    // Deeplink consumer parses ?subscribe=personal-monthly and routes to Stripe.
    expect(subscribe.getAttribute("href")).toMatch(
      /subscribe=personal-monthly/,
    );
  });

  it("offers a Self-host link pointing at the docs", () => {
    useSyncStore.setState({ pendingMigration: "license-required" });
    renderDialog();
    const selfHost = screen.getByRole("link", { name: /self-host/i });
    const href = selfHost.getAttribute("href") || "";
    expect(href).toMatch(/feedzero\.app|github\.com|self-host/i);
  });
});
