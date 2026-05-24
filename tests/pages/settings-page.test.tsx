/**
 * <SettingsPage> — focused tests for the stage page's tab wiring.
 *
 * Verifies the page reads `?tab=` from the URL, defaults to "subscription",
 * renders the new collapsed tab list, redirects legacy tab names, and
 * hides the Subscription tab in self-hosted mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SettingsPage } from "@/pages/settings-page";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/components/settings/tabs/subscription-tab", () => ({
  SubscriptionTab: () => <div data-testid="subscription-tab" />,
}));
vi.mock("@/components/settings/tabs/sync-and-data-tab", () => ({
  SyncAndDataTab: () => <div data-testid="sync-and-data-tab" />,
}));
vi.mock("@/components/settings/tabs/reading-tab", () => ({
  ReadingTab: () => <div data-testid="reading-tab" />,
}));
vi.mock("@/components/settings/tabs/briefings-tab", () => ({
  BriefingsTab: () => <div data-testid="briefings-tab" />,
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
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    renderAt("/settings?tab=sync-and-data");
    expect(screen.getByTestId("sync-and-data-tab")).toBeInTheDocument();
  });

  it("falls back to Subscription when ?tab= is unknown", () => {
    renderAt("/settings?tab=bogus");
    expect(screen.getByTestId("subscription-tab")).toBeInTheDocument();
  });

  it("redirects legacy ?tab=recovery to the Subscription tab", () => {
    renderAt("/settings?tab=recovery");
    expect(screen.getByTestId("subscription-tab")).toBeInTheDocument();
  });

  it("redirects legacy ?tab=data to the Sync & Data tab", () => {
    renderAt("/settings?tab=data");
    expect(screen.getByTestId("sync-and-data-tab")).toBeInTheDocument();
  });

  it("clicking a tab swaps the rendered content", () => {
    renderAt("/settings");
    fireEvent.click(screen.getByLabelText(/sync and data/i));
    expect(screen.getByTestId("sync-and-data-tab")).toBeInTheDocument();
  });

  it("renders all five user-facing tabs (Subscription, Sync & Data, Reading, Briefings, Help)", () => {
    renderAt("/settings");
    expect(screen.getByLabelText(/subscription/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sync and data/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^reading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^briefings$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^help$/i)).toBeInTheDocument();
  });

  it("reads ?tab=briefings and renders the Briefings tab content", () => {
    renderAt("/settings?tab=briefings");
    expect(screen.getByTestId("briefings-tab")).toBeInTheDocument();
  });

  it("clicking the Briefings tab swaps to its content (URL ↔ rendered content stay in sync)", () => {
    renderAt("/settings");
    fireEvent.click(screen.getByLabelText(/^briefings$/i));
    expect(screen.getByTestId("briefings-tab")).toBeInTheDocument();
  });

  it("does not render a Recovery tab anymore (license recovery moved into Subscription)", () => {
    renderAt("/settings");
    expect(screen.queryByLabelText(/^recovery$/i)).toBeNull();
  });

  it("clicking a tab keeps unrelated query params", () => {
    renderAt("/settings?utm=test");
    fireEvent.click(screen.getByLabelText(/^reading$/i));
    expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
  });

  describe("self-hosted mode", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_SELF_HOSTED", "1");
    });

    it("hides the Subscription tab", () => {
      renderAt("/settings");
      expect(screen.queryByLabelText(/subscription/i)).toBeNull();
    });

    it("defaults to the Sync & Data tab when no ?tab= is set", () => {
      renderAt("/settings");
      expect(screen.getByTestId("sync-and-data-tab")).toBeInTheDocument();
    });
  });
});
