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
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const mockFeed = (id: string, title: string) => ({
  id,
  url: `https://${id}.com/feed`,
  title,
  description: "",
  siteUrl: `https://${id}.com`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function renderSidebar(props: { onFeedSelect?: (id: string) => void } = {}) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar {...props} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar states", () => {
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

  it("shows Feeds group with Explore even when no feeds exist", () => {
    renderSidebar();
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("renders feed items with titles", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed"), mockFeed("b", "Beta Feed")],
    });
    renderSidebar();
    expect(screen.getByText("Alpha Feed")).toBeInTheDocument();
    expect(screen.getByText("Beta Feed")).toBeInTheDocument();
  });

  it("refresh button is disabled during refresh", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      isRefreshingAll: true,
    });
    renderSidebar();
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    expect(refreshBtn).toBeDisabled();
  });


  // Delete-confirmation flow used to live in the sidebar (dropdown
  // → AlertDialog mounted by sidebar-feed-list). It moved to
  // FeedSettingsDialog when the per-feed dropdown was removed. The
  // sidebar no longer renders a More button or any confirmation
  // dialog of its own — both responsibilities now live behind the
  // floating cog above the article list. Coverage moves to
  // tests/components/feeds/feed-settings-dialog.test.tsx.
  it("sidebar no longer renders a per-feed More dropdown trigger", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
    });
    renderSidebar();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("active feed has accent background (sidebar defaults)", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      selectedFeedId: "a",
    });
    renderSidebar();

    const feedButton = screen.getByText("Alpha Feed").closest("button");
    // Using shadcn sidebar defaults: accent background for active state
    expect(feedButton?.className).toContain(
      "data-[active=true]:bg-sidebar-accent",
    );
  });

  it("shows settings menu in footer", () => {
    renderSidebar();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides R kbd hint while refreshing", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      isRefreshingAll: true,
    });
    const { container } = renderSidebar();
    const kbds = container.querySelectorAll("kbd");
    const keys = Array.from(kbds).map((kbd) => kbd.textContent);
    expect(keys).not.toContain("R");
  });

  it("shows refresh button when feeds exist", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
    });
    renderSidebar();
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("hides refresh button when no feeds exist", () => {
    renderSidebar();
    expect(
      screen.queryByRole("button", { name: /refresh/i }),
    ).not.toBeInTheDocument();
  });

});
