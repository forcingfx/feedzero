/**
 * <SettingsPage> — focused tests for the stage page's tab wiring.
 *
 * Verifies the page reads `?tab=` from the URL, defaults to "reading",
 * renders the new collapsed tab list, redirects legacy tab names, and
 * hides the Subscription tab in self-hosted mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
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
vi.mock("@/components/settings/tabs/list-tab", () => ({
  ListTab: () => <div data-testid="list-tab" />,
}));
vi.mock("@/components/settings/tabs/library-tab", () => ({
  LibraryTab: () => <div data-testid="library-tab" />,
}));
vi.mock("@/components/settings/tabs/help-tab", () => ({
  HelpTab: () => <div data-testid="help-tab" />,
}));
vi.mock("@/hooks/use-whats-new", () => ({
  useWhatsNew: () => () => Promise.resolve(),
}));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("<SettingsPage>", () => {
  beforeEach(() => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    sessionStorage.clear();
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

  it("defaults to the Reading tab when no ?tab= is set (audit 2026-Q4: settings open on what people came to change, not a price list)", () => {
    renderAt("/settings");
    expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
  });

  it("reads the active tab from ?tab=", () => {
    renderAt("/settings?tab=sync-and-data");
    expect(screen.getByTestId("sync-and-data-tab")).toBeInTheDocument();
  });

  it("falls back to Reading when ?tab= is unknown", () => {
    renderAt("/settings?tab=bogus");
    expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
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

  it("renders all four user-facing tabs (Subscription, Sync & Data, Reading, Help)", () => {
    renderAt("/settings");
    expect(screen.getByLabelText(/subscription/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sync and data/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^reading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^help$/i)).toBeInTheDocument();
  });

  it("orders the tabs Reading, List, Library, Sync & Data, Subscription, Help", () => {
    renderAt("/settings");
    const names = screen.getAllByRole("radio").map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual(["Reading", "List", "Library", "Sync and data", "Subscription", "Help"]);
  });

  it("opens the List and Library tabs from ?tab=", () => {
    renderAt("/settings?tab=list");
    expect(screen.getByTestId("list-tab")).toBeInTheDocument();
  });

  // Six tabs do not fit a phone's width. They scroll sideways in one row
  // instead of wrapping into a block that pushes the settings down.
  it("keeps the tabs on one scrollable row", () => {
    renderAt("/settings");
    const strip = screen.getAllByRole("radio")[0]!.parentElement!;
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).not.toContain("flex-wrap");
    // Without this the strip takes its content's width and the page
    // scrolls sideways instead of the strip (bug, 2026-11-20).
    expect(strip.className).not.toMatch(/\bw-fit\b/);
  });

  it("does not render a Briefings tab (its settings live on the Signal page)", () => {
    renderAt("/settings");
    expect(screen.queryByLabelText(/^briefings$/i)).toBeNull();
  });

  it("sends legacy ?tab=briefings to Signal's own settings, which left the Reading tab", async () => {
    renderAt("/settings?tab=briefings");
    await vi.waitFor(() => {
      expect(screen.getByTestId("probe-path")).toHaveTextContent("/signal?settings=open");
    });
  });

  it("does not render a Recovery tab anymore (license recovery moved into Subscription)", () => {
    renderAt("/settings");
    expect(screen.queryByLabelText(/^recovery$/i)).toBeNull();
  });

  /**
   * Owner request 2026-11-20: "When navigating away from settings and
   * back I should be on the same screen as when I left." The tab bar's
   * Settings button and the sidebar link both go to a bare /settings, so
   * without this every return landed on Reading.
   */
  describe("returning to Settings", () => {
    it("reopens on the tab that was open when the user left", () => {
      const first = renderAt("/settings");
      fireEvent.click(screen.getByLabelText(/^library$/i));
      expect(screen.getByTestId("library-tab")).toBeInTheDocument();
      first.unmount();

      renderAt("/settings");

      expect(screen.getByTestId("library-tab")).toBeInTheDocument();
      expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings?tab=library");
    });

    it("remembers a tab opened by link as well as by tap", () => {
      renderAt("/settings?tab=list").unmount();
      renderAt("/settings");
      expect(screen.getByTestId("list-tab")).toBeInTheDocument();
    });

    it("a link that names a tab still wins over the remembered one", () => {
      renderAt("/settings?tab=list").unmount();
      renderAt("/settings?tab=help");
      expect(screen.getByTestId("help-tab")).toBeInTheDocument();
    });

    it("opens on Reading when nothing was remembered", () => {
      renderAt("/settings");
      expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
    });

    it("ignores a remembered tab that no longer exists", () => {
      sessionStorage.setItem("feedzero:settings-last-tab", "briefings");
      renderAt("/settings");
      expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
    });
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

    it("defaults to the Reading tab too (no Subscription tab to skip)", () => {
      renderAt("/settings");
      expect(screen.getByTestId("reading-tab")).toBeInTheDocument();
    });
  });
});
