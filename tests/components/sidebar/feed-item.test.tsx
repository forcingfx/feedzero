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
        onRemove={vi.fn()}
        onReload={vi.fn()}
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

describe("FeedItem", () => {
  beforeEach(() => {
    useArticleStore.setState({ unreadCounts: {} });
    useFeedStore.setState({ feeds: [mockFeed], folders: [], selectedFeedId: null });
  });

  it("renders the feed title", () => {
    renderFeedItem();
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
  });

  it("shows unread badge when count > 0", () => {
    useArticleStore.setState({ unreadCounts: { f1: 5 } });
    renderFeedItem();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not show badge when unread count is 0", () => {
    useArticleStore.setState({ unreadCounts: { f1: 0 } });
    renderFeedItem();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it.skip("enters rename mode and saves on Enter — Radix dropdown portal issue in happy-dom", async () => {
    const user = userEvent.setup();
    const renameFeed = vi.fn();
    useFeedStore.setState({ renameFeed });

    renderFeedItem();

    await user.click(screen.getByRole("button", { name: /more/i }));
    await user.click(screen.getByText("Rename"));

    // Input should appear with current title
    const input = document.querySelector("input");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("Example Feed");

    await user.clear(input!);
    await user.type(input!, "New Name{Enter}");

    expect(renameFeed).toHaveBeenCalledWith("f1", "New Name");
  });

  it("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderFeedItem({ onSelect });
    await user.click(screen.getByText("Example Feed"));
    expect(onSelect).toHaveBeenCalled();
  });
});
