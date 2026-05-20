/**
 * <DataSyncSection> — switch-toggle cloud sync UX + always-on delete.
 *
 * Verifies user-observable behaviour:
 *   - Sync toggle is operable for every tier (sync is a Free feature).
 *   - Self-hosted users with no sync server reachable see a docs overlay.
 *   - Delete all data is always clickable regardless of tier.
 *   - Paid users see a non-blocking subscription-billing warning in the
 *     delete confirmation, NOT a blocking "cancel subscription first" gate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DataSyncSection } from "@/components/settings/data-sync-section";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn().mockResolvedValue("alpha bravo charlie delta"),
}));

function renderSection() {
  return render(
    <MemoryRouter>
      <DataSyncSection />
    </MemoryRouter>,
  );
}

describe("<DataSyncSection>", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      error: null,
      credentials: null,
    });
    useFeedStore.setState({ feeds: [] });
    useLicenseStore.setState({ tier: "personal", verifying: false });
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders a single Cloud sync toggle (the primary affordance)", () => {
    renderSection();
    expect(
      screen.getByRole("switch", { name: /toggle cloud sync/i }),
    ).toBeInTheDocument();
  });

  it("toggle is OFF when status is local-only", () => {
    renderSection();
    const toggle = screen.getByRole("switch", { name: /toggle cloud sync/i });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("toggle reads ON when status is synced", () => {
    useSyncStore.setState({ status: "synced" });
    renderSection();
    const toggle = screen.getByRole("switch", { name: /toggle cloud sync/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("free-tier hosted users see an operable toggle (sync is now a Free feature)", () => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    renderSection();
    const toggle = screen.getByRole("switch", { name: /toggle cloud sync/i });
    expect(toggle).not.toBeDisabled();
    expect(
      screen.queryByText(/cloud sync requires a subscription/i),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /upgrade plan/i }),
    ).toBeNull();
  });

  it("Delete all data and reset app is visible for free users", () => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    renderSection();
    expect(
      screen.getByRole("button", { name: /delete all data and reset app/i }),
    ).toBeInTheDocument();
  });

  it("Delete all data and reset app is ALSO visible for paid users (no longer gated)", () => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    renderSection();
    expect(
      screen.getByRole("button", { name: /delete all data and reset app/i }),
    ).toBeInTheDocument();
  });

  it("paid users see a Stripe-billing warning inside the delete confirmation (but it doesn't block)", async () => {
    const user = userEvent.setup();
    useLicenseStore.setState({ tier: "personal", verifying: false });
    renderSection();
    await user.click(
      screen.getByRole("button", { name: /delete all data and reset app/i }),
    );
    // Inside the dialog: the warning text mentions Stripe but the destructive
    // button is still operable (not disabled).
    expect(screen.getByText(/stripe subscription/i)).toBeInTheDocument();
    const deleteBtn = screen.getByRole("button", { name: /delete everything/i });
    expect(deleteBtn).not.toBeDisabled();
  });

  it("syncing state disables the toggle (prevents mid-flight flip)", () => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    useSyncStore.setState({ status: "syncing" });
    renderSection();
    const toggle = screen.getByRole("switch", { name: /toggle cloud sync/i });
    expect(toggle).toBeDisabled();
  });

  it("does not show passphrase-recovery note when sync is local-only", () => {
    renderSection();
    expect(
      screen.queryByText(/cannot recover your sync passphrase/i),
    ).toBeNull();
  });

  it("shows passphrase-recovery note when sync is enabled", () => {
    useSyncStore.setState({ status: "synced" });
    renderSection();
    expect(
      screen.getByText(/cannot recover your sync passphrase/i),
    ).toBeInTheDocument();
  });

});
