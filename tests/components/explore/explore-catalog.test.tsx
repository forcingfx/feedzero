import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ExploreCatalog } from "@/components/explore/explore-catalog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { feedCatalog } from "@/lib/feed-catalog.ts";

function renderCatalog(
  props: React.ComponentProps<typeof ExploreCatalog> = {},
  initialPath: string = "/explore",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ExploreCatalog {...props} />
    </MemoryRouter>,
  );
}

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
  // FeedFormatChip probes via previewWithDiscovery; the catalog
  // tests don't assert on the chip's resolved state, only that it
  // appears for URL-like input, so a never-resolving stub is enough.
  previewFeed: vi.fn(() => new Promise(() => {})),
  previewWithDiscovery: vi.fn(() => new Promise(() => {})),
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
    renderCatalog();

    for (const category of feedCatalog) {
      expect(screen.getByText(category.name)).toBeInTheDocument();
    }
  });

  it("renders all feed names within categories", () => {
    renderCatalog();

    for (const category of feedCatalog) {
      for (const feed of category.feeds) {
        expect(screen.getByText(feed.name)).toBeInTheDocument();
      }
    }
  });

  it("renders feed descriptions", () => {
    renderCatalog();

    const firstFeed = feedCatalog[0].feeds[0];
    expect(screen.getByText(firstFeed.description)).toBeInTheDocument();
  });

  it("shows add button for unsubscribed feeds", () => {
    renderCatalog();

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

    renderCatalog();

    // One fewer add button since one feed is subscribed
    const addButtons = screen.getAllByRole("button", { name: /^add$/i });
    const totalFeeds = feedCatalog.reduce((sum, c) => sum + c.feeds.length, 0);
    expect(addButtons.length).toBe(totalFeeds - 1);

    // Remove button should be present for subscribed feed
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("shows 'Add all' button for each category", () => {
    renderCatalog();

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

    renderCatalog();

    const addAllButtons = screen.getAllByRole("button", { name: /add all|all added/i });
    // First category's button should indicate all added
    expect(addAllButtons[0]).toBeDisabled();
  });


  it("shows the discovery chip when input looks like a URL", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    await user.type(input, "example.com/feed");

    // The chip mounts immediately once we recognise a URL; its
    // network-driven inner state takes longer but the wrapper element
    // appears synchronously with the format pills.
    expect(
      await screen.findByTestId("format-pill-rss"),
    ).toBeInTheDocument();
  });

  it("does not show the discovery chip for regular search text", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    await user.type(input, "technology");

    expect(screen.queryByTestId("format-pill-rss")).not.toBeInTheDocument();
  });

  it("calls addFeed on Enter when input is a URL", async () => {
    const user = userEvent.setup();
    const addFeed = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    useFeedStore.setState({ addFeed });

    renderCatalog();

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    await user.type(input, "https://example.com/feed{Enter}");

    await waitFor(() => {
      expect(addFeed).toHaveBeenCalledWith("https://example.com/feed");
    });
  });

  it("clears input after successful URL add", async () => {
    const user = userEvent.setup();
    const addFeed = vi.fn().mockImplementation(async () => {
      useFeedStore.setState({ selectedFeedId: "new-feed" });
      return { ok: true, value: undefined };
    });
    useFeedStore.setState({ addFeed });
    const onFeedAdded = vi.fn();

    renderCatalog({ onFeedAdded });

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    await user.type(input, "https://example.com/feed{Enter}");

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
    expect(onFeedAdded).toHaveBeenCalledWith("new-feed");
  });

  it("renders Import / Export OPML button", () => {
    renderCatalog();

    expect(
      screen.getByRole("button", { name: /import.*export/i }),
    ).toBeInTheDocument();
  });

  it("feed rows have role option with aria-selected", () => {
    renderCatalog();

    const options = screen.getAllByRole("option");
    const totalFeeds = feedCatalog.reduce((sum, c) => sum + c.feeds.length, 0);
    expect(options.length).toBe(totalFeeds);

    // All should start unselected
    for (const option of options) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
  });

  it("wraps feed list in a listbox", () => {
    renderCatalog();

    expect(screen.getByRole("listbox", { name: /feeds/i })).toBeInTheDocument();
  });

  it("shows search hints when search is focused", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    await user.click(input);

    expect(screen.getByText(/to browse/)).toBeInTheDocument();
    expect(screen.getByText(/to clear/)).toBeInTheDocument();
  });

  it("focuses search input when the route includes ?focus=search", async () => {
    renderCatalog({}, "/explore?focus=search");

    const input = screen.getByPlaceholderText(/search feeds or paste/i);

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it("does not auto-focus search input without the ?focus=search param", () => {
    renderCatalog();

    const input = screen.getByPlaceholderText(/search feeds or paste/i);
    expect(input).not.toHaveFocus();
  });
});
