import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExploreCatalog } from "@/components/explore/explore-catalog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { feedCatalog } from "@/lib/feed-catalog.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn().mockResolvedValue({
    ok: true,
    value: { feed: { id: "new", title: "New" }, articles: [] },
  }),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

function resetStore() {
  useFeedStore.setState({
    feeds: [],
    selectedFeedId: null,
    isLoading: false,
    error: null,
    isRefreshingAll: false,
    refreshingFeedIds: new Set(),
  });
}

describe("ExploreCatalog", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders all category names", () => {
    render(<ExploreCatalog />);

    for (const category of feedCatalog) {
      expect(screen.getByText(category.name)).toBeInTheDocument();
    }
  });

  it("renders all feed names within categories", () => {
    render(<ExploreCatalog />);

    for (const category of feedCatalog) {
      for (const feed of category.feeds) {
        expect(screen.getByText(feed.name)).toBeInTheDocument();
      }
    }
  });

  it("renders feed descriptions", () => {
    render(<ExploreCatalog />);

    const firstFeed = feedCatalog[0].feeds[0];
    expect(screen.getByText(firstFeed.description)).toBeInTheDocument();
  });

  it("shows add button for unsubscribed feeds", () => {
    render(<ExploreCatalog />);

    const addButtons = screen.getAllByRole("button", { name: /^add$/i });
    const totalFeeds = feedCatalog.reduce((sum, c) => sum + c.feeds.length, 0);
    expect(addButtons.length).toBe(totalFeeds);
  });

  it("shows checkmark for already-subscribed feeds", () => {
    const subscribedUrl = feedCatalog[0].feeds[0].feedUrl;
    useFeedStore.setState({
      feeds: [
        {
          id: "existing",
          url: subscribedUrl,
          title: "Existing Feed",
          description: "",
          siteUrl: "https://example.com",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    });

    render(<ExploreCatalog />);

    // One fewer add button since one feed is subscribed
    const addButtons = screen.getAllByRole("button", { name: /^add$/i });
    const totalFeeds = feedCatalog.reduce((sum, c) => sum + c.feeds.length, 0);
    expect(addButtons.length).toBe(totalFeeds - 1);

    // Remove button should be present for subscribed feed
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("shows 'Add all' button for each category", () => {
    render(<ExploreCatalog />);

    const addAllButtons = screen.getAllByRole("button", { name: /add all/i });
    expect(addAllButtons.length).toBe(feedCatalog.length);
  });

  it("disables 'Add all' when all feeds in category are subscribed", () => {
    const firstCategory = feedCatalog[0];
    const subscribedFeeds = firstCategory.feeds.map((f, i) => ({
      id: `feed-${i}`,
      url: f.feedUrl,
      title: f.name,
      description: "",
      siteUrl: f.siteUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    useFeedStore.setState({ feeds: subscribedFeeds });

    render(<ExploreCatalog />);

    const addAllButtons = screen.getAllByRole("button", { name: /add all|all added/i });
    // First category's button should indicate all added
    expect(addAllButtons[0]).toBeDisabled();
  });

  it("renders tags for feeds", () => {
    render(<ExploreCatalog />);

    const firstFeed = feedCatalog[0].feeds[0];
    for (const tag of firstFeed.tags) {
      expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
    }
  });
});
