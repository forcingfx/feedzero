import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

function renderSidebar(route = "/feeds") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="*"
          element={
            <SidebarProvider>
              <AppSidebar />
              <LocationProbe />
            </SidebarProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppSidebar layout structure", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
  });

  it("renders SidebarRail", () => {
    const { container } = renderSidebar();
    const rail = container.querySelector("[data-sidebar='rail']");
    expect(rail).not.toBeNull();
  });

  it("shows the FeedZero brand mark in the sidebar header", () => {
    const { container } = renderSidebar();
    const header = container.querySelector("[data-sidebar='header']");
    expect(header).not.toBeNull();
    const mark = header!.querySelector("img[src='/icon-192.png']");
    expect(mark).not.toBeNull();
  });

  it("SidebarHeader hides refresh when no feeds exist", () => {
    const { container } = renderSidebar();
    const header = container.querySelector("[data-sidebar='header']");
    expect(header).not.toBeNull();
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  });

  it("SidebarHeader shows refresh button when feeds exist", () => {
    useFeedStore.setState({
      feeds: [
        {
          id: "feed-1",
          url: "https://example.com/rss",
          title: "Example Feed",
          description: "",
          siteUrl: "https://example.com",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
    const { container } = renderSidebar();
    const header = container.querySelector("[data-sidebar='header']");
    expect(header).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("SidebarContent has only Discover group when no feeds exist", () => {
    const { container } = renderSidebar();
    const content = container.querySelector("[data-sidebar='content']");
    expect(content).not.toBeNull();
    // Single Feeds group with Explore at top
    const groups = content!.querySelectorAll("[data-sidebar='group']");
    expect(groups).toHaveLength(1);
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("SidebarFooter contains settings menu button", () => {
    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("Settings");
  });

  it("SidebarFooter does NOT render a floating license-status pill (free user)", async () => {
    // The "Free"/"Personal"/"Pro" tier badge moved to Settings → Account.
    // A floating pill in the sidebar was not clickable and gave users a
    // false signal that something there was actionable. Tier remains visible
    // in one place: the Plan card inside Settings → Account.
    const { useLicenseStore } = await import("@/stores/license-store.ts");
    useLicenseStore.setState({ tier: "free", verifying: false });

    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).not.toContain("Free");
  });

  it("SidebarFooter does NOT render a floating license-status pill (paid user)", async () => {
    // Same as above for paid users — the tier badge belongs in Settings,
    // not floating in the sidebar.
    const { useLicenseStore } = await import("@/stores/license-store.ts");
    useLicenseStore.setState({ tier: "personal", verifying: false });

    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).not.toContain("Personal");
  });

  it("clicking the sidebar Settings button navigates to /settings", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderSidebar();

    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings");
  });

  it("renders Explore entry inside Feeds group", () => {
    renderSidebar();

    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("shows Explore even when no feeds exist", () => {
    useFeedStore.setState({ feeds: [] });
    renderSidebar();

    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("marks Explore as active on /explore route", () => {
    renderSidebar("/explore");

    const exploreButton = screen.getByRole("button", {
      name: /explore/i,
    });
    expect(exploreButton.dataset.active).toBe("true");
  });

  describe("sync chip visibility", () => {
    it("does not render the SyncBadge for local-only online users", () => {
      useSyncStore.setState({ status: "local-only" });
      const { container } = renderSidebar();
      // The amber sidebar-footer chip is the one we want suppressed.
      // Scope the check to the footer — the header SyncStatusBadge also
      // renders the word "Local" for local-only users with no refresh
      // history, and that surface is a different decision.
      const footer = container.querySelector("[data-sidebar='footer']");
      expect(footer).not.toBeNull();
      expect(footer!.textContent).not.toMatch(/\bLocal\b/);
    });

    it("still renders the Synced pill when sync is active", () => {
      useSyncStore.setState({ status: "synced" });
      renderSidebar();
      // Two renderings share the word "Synced" now: the rich header
      // SyncStatusBadge and the tiny footer chip on the Settings button.
      // Both are valid sync surfaces; the test just needs to confirm the
      // status text is present, not that there is exactly one.
      expect(screen.getAllByText(/^Synced$/).length).toBeGreaterThan(0);
    });

    it("renders the Settings label centered (single-line) when no chip is visible", () => {
      // For local-only online users SyncBadge returns null. The footer
      // trigger should collapse to a single, vertically-centered "Settings"
      // line instead of leaving an empty second row that makes the label
      // look top-aligned.
      useSyncStore.setState({ status: "local-only" });
      renderSidebar();
      const settingsLabel = screen.getByText("Settings");
      const container = settingsLabel.parentElement as HTMLElement;
      // Single-line layout uses flex with items-center, not the two-row grid.
      expect(container.className).toContain("items-center");
      expect(container.className).not.toContain("grid");
    });

    it("does NOT render a Local chip on the Settings button when local-only + online", () => {
      // The old dropdown surfaced a Local pill inline on the Cloud sync row.
      // After the dropdown→button refactor, the chip is suppressed for
      // local-only + online users — the amber "Cloud sync" launcher lives
      // inside Settings → Account instead. The button just says "Settings".
      // Scoped to the footer so the header SyncStatusBadge's "Local"
      // (a different surface, different decision) doesn't interfere.
      useSyncStore.setState({ status: "local-only" });
      const { container } = renderSidebar();
      const footer = container.querySelector("[data-sidebar='footer']");
      expect(footer).not.toBeNull();
      expect(footer!.textContent).not.toMatch(/\bLocal\b/);
    });
  });
});
