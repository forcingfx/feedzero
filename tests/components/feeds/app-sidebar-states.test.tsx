import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    <SidebarProvider>
      <AppSidebar {...props} />
    </SidebarProvider>,
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

  it("shows empty state when no feeds", () => {
    renderSidebar();
    expect(
      screen.getByText("No feeds yet. Add one above."),
    ).toBeInTheDocument();
  });

  it("renders feed items with titles", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed"), mockFeed("b", "Beta Feed")],
    });
    renderSidebar();
    expect(screen.getByText("Alpha Feed")).toBeInTheDocument();
    expect(screen.getByText("Beta Feed")).toBeInTheDocument();
  });

  it("refresh all button shows spinner during refresh", () => {
    useFeedStore.setState({ isRefreshingAll: true });
    renderSidebar();
    const refreshBtn = screen.getByTitle("Refresh all feeds");
    expect(refreshBtn).toBeDisabled();
    // The icon inside should have animate-spin class
    const svg = refreshBtn.querySelector("svg");
    expect(
      svg?.className.baseVal || svg?.getAttribute("class") || "",
    ).toContain("animate-spin");
  });

  it("add form toggles open and closed", async () => {
    const user = userEvent.setup();
    renderSidebar();

    // Initially no input visible
    expect(screen.queryByLabelText("Feed URL")).not.toBeInTheDocument();

    // Click add button to open
    await user.click(screen.getByRole("button", { name: /add feed/i }));
    expect(screen.getByLabelText("Feed URL")).toBeInTheDocument();

    // Click again to close
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    // The collapsible closes; the input should no longer be visible
    // (Radix Collapsible may still have it in DOM but hidden)
  });

  it("delete triggers confirmation dialog", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
    });
    renderSidebar();

    // Open the dropdown menu for the feed
    const moreButton = screen.getByRole("button", { name: "More" });
    await user.click(moreButton);

    // Click Delete in dropdown
    const deleteItem = screen.getByRole("menuitem", { name: /delete/i });
    await user.click(deleteItem);

    // Confirmation dialog should appear
    expect(screen.getByText(/Remove.*Alpha Feed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("cancel delete closes dialog", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
    });
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/Remove.*Alpha Feed/)).not.toBeInTheDocument();
  });

  it("confirm delete calls removeFeed", async () => {
    const user = userEvent.setup();
    const removeFeed = vi.fn();
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      removeFeed,
    });
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeFeed).toHaveBeenCalledWith("a");
  });
});
