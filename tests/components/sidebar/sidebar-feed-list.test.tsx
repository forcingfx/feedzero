import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";
import { SidebarProvider, SidebarMenu } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { toFolderFeedId } from "@/utils/constants.ts";
import userEvent from "@testing-library/user-event";

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

const mockFeed = (id: string, title: string, folderId?: string) => ({
  id,
  url: `https://${id}.com/feed`,
  title,
  description: "",
  siteUrl: `https://${id}.com`,
  folderId,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function renderList(onFeedSelect: (id: string) => void = vi.fn()) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SidebarMenu>
          <SidebarFeedList onFeedSelect={onFeedSelect} />
        </SidebarMenu>
      </SidebarProvider>
    </MemoryRouter>
  );
}

function unreadArticles(feedId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${feedId}-a${i}`,
    feedId,
    guid: `${feedId}-a${i}`,
    title: `Article ${i}`,
    link: `https://${feedId}.com/${i}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: Date.now(),
    read: false,
    createdAt: Date.now(),
  }));
}

describe("SidebarFeedList", () => {
  beforeEach(() => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
  });

  it("renders unfiled feeds at the top level", () => {
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Ars Technica"), mockFeed("f2", "Hacker News")],
      folders: [],
      selectedFeedId: null,
    });

    renderList();

    expect(screen.getByText("Ars Technica")).toBeInTheDocument();
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
  });

  it("renders feeds inside their folder", () => {
    const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
    useFeedStore.setState({
      feeds: [
        mockFeed("f1", "Unfiled Feed"),
        mockFeed("f2", "Foldered Feed", "folder-1"),
      ],
      folders: [folder],
      selectedFeedId: null,
    });

    renderList();

    expect(screen.getByText("Unfiled Feed")).toBeInTheDocument();
    expect(screen.getByText("Foldered Feed")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
  });

  it("shows New folder button", () => {
    useFeedStore.setState({ feeds: [mockFeed("f1", "Feed")], folders: [], selectedFeedId: null });

    renderList();

    expect(screen.getByText("New folder")).toBeInTheDocument();
  });

  it("clicking a folder calls onFeedSelect with the folder-aggregated feed id", async () => {
    const user = userEvent.setup();
    const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Foldered Feed", "folder-1")],
      folders: [folder],
      selectedFeedId: null,
    });
    const onFeedSelect = vi.fn();

    renderList(onFeedSelect);
    await user.click(screen.getByText("Tech"));

    expect(onFeedSelect).toHaveBeenCalledWith(toFolderFeedId("folder-1"));
  });

  it("marks folder as active when folder-aggregated feed is selected", () => {
    const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Foldered Feed", "folder-1")],
      folders: [folder],
      selectedFeedId: toFolderFeedId("folder-1"),
    });

    renderList();

    const folderButton = screen
      .getByText("Tech")
      .closest("[data-sidebar='menu-button']");
    expect(folderButton?.getAttribute("data-active")).toBe("true");
  });

  it("renders the auto-organize pill when there are many unfiled feeds", () => {
    const feeds = Array.from({ length: 12 }, (_, i) =>
      mockFeed(`f${i}`, `Feed ${i}`),
    );
    useFeedStore.setState({ feeds, folders: [], selectedFeedId: null });

    renderList();

    expect(screen.getByTestId("auto-organize-pill")).toBeInTheDocument();
  });

  it("does NOT render the auto-organize pill with few feeds", () => {
    useFeedStore.setState({
      feeds: [mockFeed("f1", "Only Feed")],
      folders: [],
      selectedFeedId: null,
    });

    renderList();

    expect(screen.queryByTestId("auto-organize-pill")).toBeNull();
  });

  describe("hover / badge invariants", () => {
    const folder = { id: "folder-1", name: "Tech", createdAt: Date.now() };

    beforeEach(() => {
      useFeedStore.setState({
        feeds: [
          mockFeed("f1", "Ars Technica"),
          mockFeed("f2", "Hacker News"),
          mockFeed("f3", "The Verge", "folder-1"),
          mockFeed("f4", "Wired", "folder-1"),
        ],
        folders: [folder],
        selectedFeedId: null,
      });
      useArticleStore.setState({
        articlesByFeedId: {
          f1: unreadArticles("f1", 3),
          f2: unreadArticles("f2", 12),
          f3: unreadArticles("f3", 7),
          f4: unreadArticles("f4", 101),
        },
      });
    });

    /**
     * Invariant 1: hovering one feed must only reveal that feed's own action
     * dots. In CSS terms, no feed/folder's `group/menu-item` may contain
     * another `group/menu-item` as a descendant — otherwise Tailwind's
     * `group-hover/menu-item:opacity-100` on the child's action would also
     * trigger on the ancestor's action.
     */
    it("each menu-item owns an isolated hover scope (no nested group/menu-item)", () => {
      renderList();
      const menuItems = document.querySelectorAll(
        "[data-sidebar='menu-item']",
      );
      expect(menuItems.length).toBeGreaterThan(0);

      for (const outer of Array.from(menuItems)) {
        for (const inner of Array.from(menuItems)) {
          if (outer === inner) continue;
          expect(outer.contains(inner)).toBe(false);
        }
      }
    });

    /**
     * Invariant 2: every feed — whether in a folder or unfiled — renders its
     * unread count when there are unread items.
     */
    it("every feed shows its unread count regardless of folder membership", () => {
      renderList();
      // Unfiled feeds
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      // Foldered feeds
      expect(screen.getByText("7")).toBeInTheDocument();
      // Count > 99 renders as 99+
      expect(screen.getByText("99+")).toBeInTheDocument();
    });

    /**
     * Invariant 3: every feed's unread badge uses the same swap-on-hover
     * classes (shadcn SidebarMenuBadge), so action dots replace the badge
     * consistently for both unfiled and in-folder feeds.
     */
    it("every feed's badge is a SidebarMenuBadge with hover-swap classes", () => {
      renderList();
      const badges = document.querySelectorAll(
        "[data-sidebar='menu-badge']",
      );
      // Four feeds, four badges.
      expect(badges.length).toBe(4);
      for (const badge of Array.from(badges)) {
        expect(badge.className).toContain("group-hover/menu-item:opacity-0");
        expect(badge.className).toContain(
          "group-has-[[data-state=open]]/menu-item:opacity-0",
        );
      }
    });
  });
});
