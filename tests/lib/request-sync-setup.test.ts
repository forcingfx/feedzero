/**
 * requestSyncSetup() — intent-layer gate for the "Enable cloud sync" affordance.
 *
 * The pre-PR behavior was: free users in production paywall mode could click
 * "Enable cloud sync", derive a passphrase, push a vault, and only then hit
 * a 401 from /api/sync — landing in SyncMigrationDialog with no clear path
 * back. This helper gates at the intent layer: a free user clicking the
 * affordance opens UpgradeDialog instead, never reaching the dead-end.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { requestSyncSetup } from "@/lib/request-sync-setup";
import { useLicenseStore } from "@/stores/license-store";
import { useSyncStore } from "@/stores/sync-store";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));
vi.mock("@/core/features/paid-tier-active", () => ({
  isPaidTierActive: vi.fn(() => true),
}));

import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";

describe("requestSyncSetup", () => {
  beforeEach(() => {
    useLicenseStore.setState({
      tier: "free",
      verifying: false,
      upgradeDialogOpen: false,
    });
    useSyncStore.setState({ dialogOpen: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(true);
  });

  it("opens UpgradeDialog and does NOT open SyncSetupDialog for free users when paid tier is active", () => {
    requestSyncSetup();
    expect(useLicenseStore.getState().upgradeDialogOpen).toBe(true);
    expect(useSyncStore.getState().dialogOpen).toBe(false);
  });

  it("opens SyncSetupDialog directly for personal-tier users", () => {
    useLicenseStore.setState({ tier: "personal" });
    requestSyncSetup();
    expect(useSyncStore.getState().dialogOpen).toBe(true);
    expect(useLicenseStore.getState().upgradeDialogOpen).toBe(false);
  });

  it("opens SyncSetupDialog directly for self-hosted (gate bypassed)", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    requestSyncSetup();
    expect(useSyncStore.getState().dialogOpen).toBe(true);
    expect(useLicenseStore.getState().upgradeDialogOpen).toBe(false);
  });

  it("opens SyncSetupDialog directly when paid tier is dormant (every feature free)", () => {
    vi.mocked(isPaidTierActive).mockReturnValue(false);
    requestSyncSetup();
    expect(useSyncStore.getState().dialogOpen).toBe(true);
    expect(useLicenseStore.getState().upgradeDialogOpen).toBe(false);
  });
});
