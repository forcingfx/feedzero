/**
 * <SettingsDialog> — focused tab-wiring tests.
 *
 * Verifies the Account tab is reachable and that the dialog is driven by
 * useSettingsStore (props-less). Behavioral details of each tab are tested
 * in their own spec files (account-tab.test.tsx, etc.).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useLicenseStore } from "@/stores/license-store";
import { useSettingsStore } from "@/stores/settings-store";
import { openSettings, closeSettings } from "@/lib/open-settings";

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
    useSettingsStore.setState({ open: false, activeTab: "account" });
  });

  it("renders nothing when the store says closed", () => {
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens via openSettings() and lands on the Account tab by default", () => {
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    act(() => openSettings());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /subscribe to personal/i }),
    ).toBeInTheDocument();
  });

  it("renders all five tab toggles (account / reading / help / import / export)", () => {
    act(() => openSettings());
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^reading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^help$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import feeds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/export feeds/i)).toBeInTheDocument();
  });

  it("opens on the specified tab when openSettings('import') is called", () => {
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    act(() => openSettings("import"));
    expect(screen.getByTestId("import-view")).toBeInTheDocument();
  });

  it("clicking a toggle updates the store's activeTab", () => {
    act(() => openSettings());
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText(/export feeds/i));
    expect(useSettingsStore.getState().activeTab).toBe("export");
    expect(screen.getByTestId("export-view")).toBeInTheDocument();
  });

  it("closeSettings() closes the dialog", () => {
    act(() => openSettings());
    render(
      <MemoryRouter>
        <SettingsDialog />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => closeSettings());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
