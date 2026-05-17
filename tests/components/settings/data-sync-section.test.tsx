/**
 * <DataSyncSection> — inline cloud sync controls for the Account tab.
 *
 * Replaces the SyncSetupDialog modal for the in-Settings flow. Renders the
 * status view inline (no Dialog wrapper); SetupWizard, ExistingCloudFlow,
 * and confirmation prompts stay as nested dialogs triggered by buttons.
 *
 * Tests cover the user-observable conditional rendering by sync status,
 * not the deep sub-dialog flows (those keep their own SyncSetupDialog
 * tests until that component is deleted).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataSyncSection } from "@/components/settings/data-sync-section";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn().mockResolvedValue("alpha bravo charlie delta"),
}));

describe("<DataSyncSection>", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      error: null,
      credentials: null,
    });
    useFeedStore.setState({ feeds: [] });
  });

  it("renders Enable sync and Use existing cloud account buttons when local-only", () => {
    render(<DataSyncSection />);
    expect(
      screen.getByRole("button", { name: /enable sync/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use existing/i }),
    ).toBeInTheDocument();
  });

  it("renders Switch to local / Restore / Log out when synced", () => {
    useSyncStore.setState({ status: "synced" });
    render(<DataSyncSection />);
    expect(
      screen.getByRole("button", { name: /switch to local/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /restore from cloud/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log out/i }),
    ).toBeInTheDocument();
  });

  it("shows a destructive Delete all data button when the user is on the Free tier", () => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    render(<DataSyncSection />);
    expect(
      screen.getByRole("button", { name: /delete all data/i }),
    ).toBeInTheDocument();
  });

  it("HIDES Delete all data and shows a Manage subscription CTA when the user has an active paid subscription", () => {
    // Why: a paid user clicking Delete would wipe local data but leave the
    // Stripe subscription orphaned (still billing them with no app to use
    // it on). Force them through the portal first so cancellation and data
    // deletion are sequenced safely.
    useLicenseStore.setState({ tier: "personal", verifying: false });
    render(<DataSyncSection />);
    expect(
      screen.queryByRole("button", { name: /delete all data/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /manage subscription/i }),
    ).toBeInTheDocument();
    // Explanatory copy must mention canceling the subscription first
    expect(
      screen.getByText(/cancel.*subscription/i),
    ).toBeInTheDocument();
  });

  it("paid-tier Pro user also sees the Manage subscription gate (not just personal)", () => {
    useLicenseStore.setState({ tier: "pro", verifying: false });
    render(<DataSyncSection />);
    expect(
      screen.queryByRole("button", { name: /delete all data/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /manage subscription/i }),
    ).toBeInTheDocument();
  });

  it("shows status text reflecting current sync state", () => {
    useSyncStore.setState({ status: "synced" });
    render(<DataSyncSection />);
    expect(screen.getByText(/encrypted and synced/i)).toBeInTheDocument();
  });

  it("shows the sync error message when status is error", () => {
    useSyncStore.setState({ status: "error", error: "fake network blip" });
    render(<DataSyncSection />);
    expect(screen.getByText(/fake network blip/i)).toBeInTheDocument();
  });
});
