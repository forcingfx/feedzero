/**
 * <SettingsDialog> — focused tab-wiring tests.
 *
 * Verifies the Account tab is reachable. Behavioral details of each tab
 * are tested in their own spec files (account-tab.test.tsx, etc.).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useLicenseStore } from "@/stores/license-store";

// Mock the heavyweight tab views — we're testing the dialog's switching,
// not the views themselves.
vi.mock("@/components/settings/import-view", () => ({
  ImportView: () => <div data-testid="import-view" />,
}));
vi.mock("@/components/settings/export-view", () => ({
  ExportView: () => <div data-testid="export-view" />,
}));

describe("<SettingsDialog>", () => {
  beforeEach(() => {
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("renders an Account toggle alongside Import/Export", () => {
    render(<SettingsDialog open onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/import feeds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/export feeds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
  });

  it("clicking the Account toggle shows the AccountTab", () => {
    render(<SettingsDialog open onOpenChange={() => {}} />);
    // Sanity: Import is the default view
    expect(screen.getByTestId("import-view")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/account/i));

    // AccountTab on free tier shows the Subscribe CTA
    expect(
      screen.getByRole("link", { name: /subscribe to personal/i }),
    ).toBeInTheDocument();
    // And Import is gone
    expect(screen.queryByTestId("import-view")).toBeNull();
  });
});
