import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("AppSidebar", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });
  });

  it("shows no Feeds group label when no feeds exist", () => {
    renderSidebar();
    expect(screen.queryByText("Feeds")).not.toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
  });

  it("renders feed items", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed"), mockFeed("b", "Beta Feed")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });

    renderSidebar();
    expect(screen.getByText("Alpha Feed")).toBeInTheDocument();
    expect(screen.getByText("Beta Feed")).toBeInTheDocument();
  });

  it("calls onFeedSelect when feed clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });

    renderSidebar({ onFeedSelect: onSelect });
    await user.click(screen.getByText("Alpha Feed"));

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("has add feed button", () => {
    renderSidebar();
    expect(
      screen.getByRole("button", { name: /add feed/i }),
    ).toBeInTheDocument();
  });

  it("has refresh all button when feeds exist", () => {
    useFeedStore.setState({
      feeds: [mockFeed("a", "Alpha Feed")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
    });
    renderSidebar();
    expect(
      screen.getByRole("button", { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it("shows app title", () => {
    renderSidebar();
    expect(screen.getByText("FeedZero")).toBeInTheDocument();
  });
});
