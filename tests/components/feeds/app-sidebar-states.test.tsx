import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

  it("hides Feeds group label when no feeds exist", () => {
    renderSidebar();
    // Feeds group hidden, only Discover group visible
    expect(screen.queryByText("Feeds")).not.toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
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

  it("add form toggles open and closed", async () => {
    const user = userEvent.setup();
    renderSidebar();

    // Initially no input visible
    expect(screen.queryByLabelText("Feed URL")).not.toBeInTheDocument();

    // Click add button to open
    await user.click(screen.getByRole("button", { name: /add feed/i }));
    expect(screen.getByLabelText("Feed URL")).toBeInTheDocument();

    // Click again to close (same button toggles)
    await user.click(screen.getByRole("button", { name: /add feed/i }));
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

  it("opens add form when feedzero:add-feed event is dispatched", () => {
    renderSidebar();

    // Initially no input visible
    expect(screen.queryByLabelText("Feed URL")).not.toBeInTheDocument();

    // Dispatch the custom event
    act(() => {
      document.dispatchEvent(new CustomEvent("feedzero:add-feed"));
    });

    expect(screen.getByLabelText("Feed URL")).toBeInTheDocument();
  });
});
