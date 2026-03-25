import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";

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

  it("SidebarHeader contains add button (refresh only when feeds exist)", () => {
    const { container } = renderSidebar();
    const header = container.querySelector("[data-sidebar='header']");
    expect(header).not.toBeNull();
    // Refresh button is hidden when no feeds exist
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /add feed/i }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: /add feed/i }),
    ).toBeInTheDocument();
  });

  it("SidebarContent has only Discover group when no feeds exist", () => {
    const { container } = renderSidebar();
    const content = container.querySelector("[data-sidebar='content']");
    expect(content).not.toBeNull();
    // Discover group always present, Feeds group absent
    const groups = content!.querySelectorAll("[data-sidebar='group']");
    expect(groups).toHaveLength(1);
    expect(screen.getByText("Discover")).toBeInTheDocument();
  });

  it("SidebarFooter contains settings menu button", () => {
    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("Settings");
  });

  it("renders Discover group with Explore feeds entry", () => {
    renderSidebar();

    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Explore feeds")).toBeInTheDocument();
  });

  it("shows Discover group even when no feeds exist", () => {
    useFeedStore.setState({ feeds: [] });
    renderSidebar();

    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Explore feeds")).toBeInTheDocument();
  });

  it("marks Explore feeds as active on /explore route", () => {
    renderSidebar("/explore");

    const exploreButton = screen.getByRole("button", {
      name: /explore feeds/i,
    });
    expect(exploreButton.dataset.active).toBe("true");
  });
});
