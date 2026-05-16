import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";

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
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
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

  it("SidebarFooter renders the license-status chip (free by default)", async () => {
    // Reset license-store to the free baseline so we don't read a paid tier
    // leaked from another test file in the same vitest module worker.
    const { useLicenseStore } = await import("@/stores/license-store.ts");
    useLicenseStore.setState({ tier: "free", verifying: false });

    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    // The chip uses aria-live="polite" — find it by the label text.
    expect(footer!.textContent).toContain("Free");
  });

  it("SidebarFooter license chip reflects a personal-tier customer", async () => {
    const { useLicenseStore } = await import("@/stores/license-store.ts");
    useLicenseStore.setState({ tier: "personal", verifying: false });

    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("Personal");
    // Free label should not be present when tier is Personal — guards against
    // dual-mount regressions.
    expect(footer!.textContent).not.toContain("Free");
  });

  it("settings dropdown contains an Auto-organize menu item", async () => {
    // Need at least one feed so the settings menu shows the relevant section.
    useFeedStore.setState({
      feeds: [
        {
          id: "f1",
          url: "https://example.com/x.xml",
          title: "Example",
          description: "",
          siteUrl: "https://example.com",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderSidebar();

    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      await screen.findByText(/Auto-organize/i),
    ).toBeInTheDocument();
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
      renderSidebar();
      // The amber sidebar-footer chip is the one we want suppressed; ensure
      // no element with the visible 'Local' label is in the document.
      expect(screen.queryByText(/^Local$/)).not.toBeInTheDocument();
    });

    it("still renders the Synced pill when sync is active", () => {
      useSyncStore.setState({ status: "synced" });
      renderSidebar();
      expect(screen.getByText(/^Synced$/)).toBeInTheDocument();
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

    it("shows a Local pill inside the Settings dropdown when status is local-only", async () => {
      useSyncStore.setState({ status: "local-only" });
      useFeedStore.setState({
        feeds: [
          {
            id: "feed-1",
            url: "https://example.com/rss",
            title: "Example Feed",
            description: "",
            siteUrl: "https://example.com",
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      });
      const { default: userEvent } = await import("@testing-library/user-event");
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByRole("button", { name: /settings/i }));
      // Local pill inside the open dropdown.
      expect(await screen.findByText(/^Local$/)).toBeInTheDocument();
    });
  });
});
