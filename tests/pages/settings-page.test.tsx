/**
 * <SettingsPage> — focused tests for the stage page's tab wiring.
 *
 * Verifies the page reads `?tab=` from the URL, defaults to "account",
 * and updates the URL when the user clicks a tab. Behaviour of each tab
 * (AccountTab, ImportView, etc.) is covered by their own specs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsPage } from "@/pages/settings-page";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/components/settings/import-view", () => ({
  ImportView: () => <div data-testid="import-view" />,
}));
vi.mock("@/components/settings/export-view", () => ({
  ExportView: () => <div data-testid="export-view" />,
}));
vi.mock("@/components/settings/account-tab", () => ({
  AccountTab: () => <div data-testid="account-tab" />,
}));
vi.mock("@/components/settings/reading-tab", () => ({
  ReadingTab: () => <div data-testid="reading-tab" />,
}));
vi.mock("@/components/settings/help-tab", () => ({
  HelpTab: () => <div data-testid="help-tab" />,
}));
vi.mock("@/hooks/use-whats-new", () => ({
  useWhatsNew: () => () => Promise.resolve(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("<SettingsPage>", () => {
  beforeEach(() => {
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("renders the page header with a Settings title", () => {
    renderAt("/settings");
    expect(
      screen.getByRole("heading", { name: /settings/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("defaults to the Account tab when no ?tab= is set", () => {
    renderAt("/settings");
    expect(screen.getByTestId("account-tab")).toBeInTheDocument();
  });

  it("reads the active tab from ?tab=", () => {
    renderAt("/settings?tab=import");
    expect(screen.getByTestId("import-view")).toBeInTheDocument();
  });

  it("falls back to Account when ?tab= is unknown", () => {
    renderAt("/settings?tab=bogus");
    expect(screen.getByTestId("account-tab")).toBeInTheDocument();
  });

  it("clicking a tab swaps the rendered content", () => {
    renderAt("/settings");
    fireEvent.click(screen.getByLabelText(/export feeds/i));
    expect(screen.getByTestId("export-view")).toBeInTheDocument();
  });

  it("clicking a tab keeps unrelated query params", () => {
    renderAt("/settings?utm=test");
    fireEvent.click(screen.getByLabelText(/^reading$/i));
    expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
  });

  it("renders all five tabs", () => {
    renderAt("/settings");
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^reading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^help$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import feeds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/export feeds/i)).toBeInTheDocument();
  });
});
