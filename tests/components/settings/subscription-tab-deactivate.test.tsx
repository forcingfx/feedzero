/**
 * PR C: <SubscriptionTab>'s "Deactivate FeedZero <Tier> on this device"
 * button + the info chip when paid + synced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { SubscriptionTab } from "@/components/settings/tabs/subscription-tab";
import { useLicenseStore } from "@/stores/license-store";
import { useSyncStore } from "@/stores/sync-store";
import {
  setLicenseToken,
  clearLicenseToken,
} from "@/core/license/license-token-store";
import { encodeLicensePayload, type LicenseTier } from "@/core/license/format";
import { base64UrlEncode } from "@/core/license/crypto";

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
  rekeyFromPassphrase: vi.fn(),
}));
vi.mock("@/core/sync/vault-crypto", () => ({
  deriveVaultId: vi.fn(),
  deriveVaultKey: vi.fn(),
}));

function makeToken(tier: LicenseTier): string {
  const payload = encodeLicensePayload({
    tier,
    expirySec: 1_800_000_000,
    customerId: "cus_test",
    keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    issuedAtSec: 1_700_000_000,
  });
  return `fz_${base64UrlEncode(payload)}.c2lnbmF0dXJl`;
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=subscription"]}>
      <Routes>
        <Route path="*" element={<SubscriptionTab />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<SubscriptionTab> deactivate (PR C)", () => {
  beforeEach(() => {
    localStorage.clear();
    setLicenseToken(makeToken("personal"));
    useLicenseStore.setState({ tier: "personal", verifying: false });
    useSyncStore.setState({
      status: "local-only",
      credentials: null,
      error: null,
    });
  });

  afterEach(() => {
    clearLicenseToken();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("renders the Deactivate button for paid users", () => {
    renderTab();
    expect(
      screen.getByRole("button", { name: /deactivate.*on this device/i }),
    ).toBeInTheDocument();
  });

  it("clicking Deactivate opens a confirmation dialog with explicit copy", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(
      screen.getByRole("button", { name: /deactivate.*on this device/i }),
    );
    // Confirmation dialog spells out what survives + what doesn't.
    expect(
      screen.getByRole("heading", { name: /deactivate personal/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cloud vault.*intact/i)).toBeInTheDocument();
  });

  it("confirming triggers deactivateLocal (license cleared, sync disabled, status local-only)", async () => {
    const user = userEvent.setup();
    useSyncStore.setState({ status: "synced", credentials: null });

    renderTab();
    await user.click(
      screen.getByRole("button", { name: /deactivate.*on this device/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /^deactivate on this device$/i }),
    );

    await waitFor(() => {
      expect(useSyncStore.getState().status).toBe("local-only");
    });
  });

  it("info chip about Data → Switch to local only is shown when paid AND synced", () => {
    useSyncStore.setState({ status: "synced" });
    renderTab();
    expect(
      screen.getByText(/data → switch to local only/i),
    ).toBeInTheDocument();
  });

  it("info chip is hidden when sync is local-only (nothing to disable)", () => {
    useSyncStore.setState({ status: "local-only" });
    renderTab();
    expect(
      screen.queryByText(/data → switch to local only/i),
    ).toBeNull();
  });
});
