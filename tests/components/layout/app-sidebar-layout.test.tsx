import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
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
          siteUrl: "https://example.com",
          createdAt: Date.now(),
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

  it("SidebarContent wraps feed list", () => {
    const { container } = renderSidebar();
    const content = container.querySelector("[data-sidebar='content']");
    expect(content).not.toBeNull();
    // Empty state component should be within the content area
    const emptyMsg = screen.getByText("No feeds yet");
    expect(content!.contains(emptyMsg)).toBe(true);
  });

  it("SidebarFooter contains SyncStatusChip", () => {
    const { container } = renderSidebar();
    const footer = container.querySelector("[data-sidebar='footer']");
    expect(footer).not.toBeNull();
    // SyncStatusChip renders a button with status text
    expect(footer!.textContent).toContain("Local");
  });

  it("hides keyboard hints when no feeds exist", () => {
    const { container } = renderSidebar();
    const header = container.querySelector("[data-sidebar='header']");
    // No J/K hints (no articles to navigate)
    expect(header!.textContent).not.toMatch(/articles/i);
    // No U/I hints (no feeds to navigate between) - check header only to avoid matching "Feeds" group label
    expect(header!.textContent).not.toMatch(/\bfeeds\b/i);
  });

  it("shows J/K hints but not U/I hints when only one feed exists", () => {
    useFeedStore.setState({
      feeds: [
        {
          id: "feed-1",
          url: "https://example.com/rss",
          title: "Example Feed",
          siteUrl: "https://example.com",
          createdAt: Date.now(),
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
    // J/K hints shown (can navigate articles)
    expect(header!.textContent).toMatch(/articles/i);
    // U/I hints hidden (only one feed, no need to switch)
    expect(header!.textContent).not.toMatch(/\bfeeds\b/i);
  });

  it("shows both U/I and J/K hints when multiple feeds exist", () => {
    useFeedStore.setState({
      feeds: [
        {
          id: "feed-1",
          url: "https://a.com/rss",
          title: "Feed A",
          siteUrl: "https://a.com",
          createdAt: Date.now(),
        },
        {
          id: "feed-2",
          url: "https://b.com/rss",
          title: "Feed B",
          siteUrl: "https://b.com",
          createdAt: Date.now(),
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
    // Both hints shown (textContent concatenates without spaces, so "UI feeds" becomes "UIfeeds")
    expect(header!.textContent).toMatch(/articles/i);
    expect(header!.textContent).toMatch(/feeds/i);
  });
});
