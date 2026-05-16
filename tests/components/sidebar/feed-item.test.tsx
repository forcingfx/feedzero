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

describe("FeedItem", () => {
  beforeEach(() => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    useFeedStore.setState({ feeds: [mockFeed], folders: [], selectedFeedId: null });
  });

  it("derives unread count from articlesByFeedId, not a stored counter", () => {
    // This is the architectural invariant: there is a single source of
    // truth for unread-ness (the article set), and the badge reads it.
    // Proving this at the component level prevents the regression class
    // where a writer mutates the source and forgets to update a separate
    // counter field.
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

  it("renders the feed title", () => {
    renderFeedItem();
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
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

  it("unfiled feed renders unread count as SidebarMenuBadge that swaps with the action dots", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem();
    const badge = screen.getByText("5").closest("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
    // Badge should hide on group hover (when action dots appear)
    expect(badge!.className).toContain("group-hover/menu-item:opacity-0");
    // Badge should also hide when dropdown menu is open (data-state=open)
    expect(badge!.className).toContain("group-has-[[data-state=open]]/menu-item:opacity-0");
  });

  it("in-folder feed renders unread count as SidebarMenuBadge with identical swap behavior", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFeedItem({ inFolder: true });
    // Badge should use the shadcn SidebarMenuBadge, not an inline span inside the button
    const feedButton = screen.getByText("Example Feed").closest("[data-sidebar='menu-button']");
    expect(feedButton!.textContent).not.toContain("5");
    const badge = screen.getByText("5").closest("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
    // Same swap behavior as unfiled feeds — consistency across both contexts.
    expect(badge!.className).toContain("group-hover/menu-item:opacity-0");
    expect(badge!.className).toContain("group-has-[[data-state=open]]/menu-item:opacity-0");
  });

  it("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderFeedItem({ onSelect });
    await user.click(screen.getByText("Example Feed"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("unread badge is hidden on mobile (max-md:hidden) to avoid simultaneous badge + action dots", () => {
    // On mobile, SidebarMenuAction showOnHover defaults to visible (md:opacity-0 only
    // applies ≥768px). Without hiding the badge on mobile, both the count and the
    // three-dots trigger are permanently visible at the same time. Since the badge
    // is informational and the action is interactive, we hide the badge on mobile.
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

  it("dropdown shows a 'Prefer full text' toggle that calls setFeedPreferFullText", async () => {
    const setFeedPreferFullText = vi.fn().mockResolvedValue(undefined);
    useFeedStore.setState({ setFeedPreferFullText });
    const user = userEvent.setup();
    renderFeedItem();
    await user.click(screen.getByRole("button", { name: /more/i }));
    const item = await screen.findByRole("menuitem", { name: /prefer full text/i });
    await user.click(item);
    expect(setFeedPreferFullText).toHaveBeenCalledWith("f1", true);
  });

  it("Prefer full text menu item shows a check when the feed already opts in", async () => {
    const user = userEvent.setup();
    renderFeedItem({ feed: { ...mockFeed, preferFullText: true } });
    await user.click(screen.getByRole("button", { name: /more/i }));
    const item = await screen.findByRole("menuitem", { name: /prefer full text/i });
    // The Check icon is opacity-100 when on, opacity-0 when off.
    const icon = item.querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("opacity-100");
  });

  it("action dots do not appear on click-focus, only on hover or keyboard focus-visible", () => {
    // Bug: clicking a feed puts the button into :focus state (click focus).
    // The shadcn SidebarMenuAction's showOnHover variant used
    // `group-focus-within/menu-item:opacity-100`, which matches ANY focus —
    // including click focus — so after clicking the action dots became
    // visible alongside the unread badge, overlapping it.
    //
    // The fix is to use `group-has-[:focus-visible]` instead, which only
    // matches when the focused element has :focus-visible (keyboard focus,
    // not mouse click). This test enforces the class substitution at the
    // source, so a regression in the shadcn wrapper is caught immediately.
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 5 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    const { container } = renderFeedItem({ isSelected: true });
    const action = container.querySelector("[data-sidebar='menu-action']");
    expect(action).not.toBeNull();
    // Negative: must not reveal the action on any focus (including click).
    expect(action!.className).not.toContain(
      "group-focus-within/menu-item:opacity-100",
    );
    // Positive: hover-based reveal must still work.
    expect(action!.className).toContain("group-hover/menu-item:opacity-100");
  });
});
