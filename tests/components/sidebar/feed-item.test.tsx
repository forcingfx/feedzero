import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedItem } from "@/components/sidebar/feed-item.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";

function renderFeedItem(props: Partial<React.ComponentProps<typeof FeedItem>> = {}) {
  return render(
    <SidebarProvider>
      <FeedItem
        feed={mockFeed}
        isSelected={false}
        onSelect={vi.fn()}
        {...props}
      />
    </SidebarProvider>
  );
}

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

const mockFeed = {
  id: "f1",
  url: "https://example.com/feed",
  title: "Example Feed",
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function articleFixture(id: string, read: boolean, feedId = "f1") {
  return {
    id,
    feedId,
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "<p>content</p>",
    summary: "",
    author: "",
    publishedAt: Date.now(),
    read,
    createdAt: Date.now(),
  };
}

/**
 * FeedItem is now select-only — its dropdown was removed in favour
 * of the floating cog above the article list, which dispatches to
 * FeedSettingsDialog. Tests below verify the row's remaining
 * responsibilities: title + favicon + unread badge derivation +
 * click-to-select + drag-handle attachment.
 *
 * Per-feed configuration (rename / prefer / prefetch / rules /
 * refresh / delete) is covered in:
 *  - tests/components/feeds/feed-settings-dialog.test.tsx
 *  - tests/components/articles/settings-pill.test.tsx
 */
describe("FeedItem", () => {
  beforeEach(() => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    useFeedStore.setState({ feeds: [mockFeed], folders: [], selectedFeedId: null });
  });

  it("renders the feed title", () => {
    renderFeedItem();
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
  });

  it("derives unread count from articlesByFeedId, not a stored counter", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [
          articleFixture("a1", false),
          articleFixture("a2", false),
          articleFixture("a3", true),
        ],
      },
    });
    renderFeedItem();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows unread badge when count > 0", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not show badge when unread count is 0", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [articleFixture("a1", true), articleFixture("a2", true)],
      },
    });
    renderFeedItem();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders unread count as SidebarMenuBadge (single-source-of-truth, not inline span)", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem();
    const badge = screen.getByText("5").closest("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
  });

  it("in-folder feed renders the same badge component (consistency across contexts)", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem({ inFolder: true });
    const feedButton = screen.getByText("Example Feed").closest("[data-sidebar='menu-button']");
    expect(feedButton!.textContent).not.toContain("5");
    const badge = screen.getByText("5").closest("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
  });

  it("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderFeedItem({ onSelect });
    await user.click(screen.getByText("Example Feed"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("unread badge is hidden on mobile (max-md:hidden) to keep the row compact", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 3 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem();
    const badge = screen.getByText("3").closest("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("max-md:hidden");
  });

  it("no longer renders any three-dot dropdown trigger (cog at top of article list owns settings now)", () => {
    renderFeedItem();
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull();
  });

  it("shows a red error indicator when the feed is a placeholder (lastError set, never succeeded)", () => {
    // Placeholder feeds from a failed bulk-import need a visible
    // affordance so the user knows to hit refresh. The indicator is
    // distinct from the amber 'stale' indicator (which means "we used
    // to fetch this, now it's quiet") to avoid conflating the two states.
    renderFeedItem({
      feed: {
        ...mockFeed,
        lastError: "HTTP 429, retry after 60s",
        // lastSuccessfulFetchAt deliberately undefined — never fetched.
        lastFetchedAt: Date.now(),
      },
    });
    const indicator = screen.getByTestId("failed-feed-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator.getAttribute("aria-label")).toMatch(/HTTP 429/);
  });

  it("does NOT show the error indicator on a healthy feed", () => {
    renderFeedItem({
      feed: {
        ...mockFeed,
        lastFetchedAt: Date.now(),
        lastSuccessfulFetchAt: Date.now(),
      },
    });
    expect(screen.queryByTestId("failed-feed-indicator")).toBeNull();
  });

  it("does NOT show the error indicator on a feed that worked before but recently failed", () => {
    // We rely on the existing stale indicator for "worked, now broken"
    // beyond the 14-day threshold. Recently-failed-but-previously-OK
    // feeds stay quiet to avoid noise.
    renderFeedItem({
      feed: {
        ...mockFeed,
        lastError: "transient 503",
        lastFetchedAt: Date.now(),
        lastSuccessfulFetchAt: Date.now() - 60 * 1000,
      },
    });
    expect(screen.queryByTestId("failed-feed-indicator")).toBeNull();
  });
});
