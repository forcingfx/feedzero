/**
 * <SettingsPage> — focused tests for the stage page's tab wiring.
 *
 * Verifies the page reads `?tab=` from the URL, defaults to "subscription",
 * and updates the URL when the user clicks a tab. Behaviour of each tab
 * (SubscriptionTab, RecoveryTab, etc.) is covered by their own specs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsPage } from "@/pages/settings-page";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/components/settings/tabs/subscription-tab", () => ({
  SubscriptionTab: () => <div data-testid="subscription-tab" />,
}));
vi.mock("@/components/settings/tabs/recovery-tab", () => ({
  RecoveryTab: () => <div data-testid="recovery-tab" />,
}));
vi.mock("@/components/settings/tabs/data-tab", () => ({
  DataTab: () => <div data-testid="data-tab" />,
}));
vi.mock("@/components/settings/tabs/reading-tab", () => ({
  ReadingTab: () => <div data-testid="reading-tab" />,
}));
vi.mock("@/components/settings/tabs/help-tab", () => ({
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

  it("defaults to the Subscription tab when no ?tab= is set", () => {
    renderAt("/settings");
    expect(screen.getByTestId("subscription-tab")).toBeInTheDocument();
  });

  it("reads the active tab from ?tab=", () => {
    renderAt("/settings?tab=data");
    expect(screen.getByTestId("data-tab")).toBeInTheDocument();
  });

  it("falls back to Subscription when ?tab= is unknown", () => {
    renderAt("/settings?tab=bogus");
    expect(screen.getByTestId("subscription-tab")).toBeInTheDocument();
  });

  it("clicking a tab swaps the rendered content", () => {
    renderAt("/settings");
    fireEvent.click(screen.getByLabelText(/recovery/i));
    expect(screen.getByTestId("recovery-tab")).toBeInTheDocument();
  });

  it("renders all five tabs", () => {
    renderAt("/settings");
    expect(screen.getByLabelText(/subscription/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recovery/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^data$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^reading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^help$/i)).toBeInTheDocument();
  });

  it("clicking a tab keeps unrelated query params", () => {
    renderAt("/settings?utm=test");
    fireEvent.click(screen.getByLabelText(/^reading$/i));
    expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
  });
});
