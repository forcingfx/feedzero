import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderItem } from "@/components/sidebar/folder-item.tsx";
import { FeedItem } from "@/components/sidebar/feed-item.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

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

const mockFolder = { id: "folder-1", name: "Tech News", createdAt: Date.now() };

function articleFixture(id: string, read: boolean, feedId = "f1") {
  return {
    id,
    feedId,
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: Date.now(),
    read,
    createdAt: Date.now(),
  };
}

const mockFeed = {
  id: "f1",
  url: "https://example.com/feed",
  title: "BBC News",
  description: "",
  siteUrl: "https://example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  folderId: "folder-1",
};

function renderFolder(props: Partial<React.ComponentProps<typeof FolderItem>> = {}) {
  return render(
    <SidebarProvider>
      <FolderItem
        folder={mockFolder}
        onDelete={vi.fn()}
        isSelected={false}
        onSelect={vi.fn()}
        {...props}
      >
        <div data-testid="child-content">Child feeds here</div>
      </FolderItem>
    </SidebarProvider>
  );
}

function renderFolderWithFeed(folderProps: Partial<React.ComponentProps<typeof FolderItem>> = {}) {
  // Wrap in a <ul> to mirror the production parent (SidebarMenu) so tests
  // can assert the folder's root element is a valid <li> child of that list.
  return render(
    <SidebarProvider>
      <ul data-testid="folder-parent-list">
        <FolderItem
          folder={mockFolder}
          onDelete={vi.fn()}
          isSelected={false}
          onSelect={vi.fn()}
          {...folderProps}
        >
          <FeedItem
            feed={mockFeed}
            isSelected={false}
            inFolder
            onSelect={vi.fn()}
            onRemove={vi.fn()}
            onReload={vi.fn()}
          />
        </FolderItem>
      </ul>
    </SidebarProvider>
  );
}

describe("FolderItem", () => {
  beforeEach(() => {
    // Reset folder open-state so a prior test's chevron click doesn't leak
    // a "closed" state into the next test's render (folder open-state moved
    // from per-component useState into feed-store).
    useFeedStore.setState({ folders: [mockFolder], folderOpenState: {} });
  });

  it("renders the folder name", () => {
    renderFolder();
    expect(screen.getByText("Tech News")).toBeInTheDocument();
  });

  it("renders children when expanded (default open)", () => {
    renderFolder();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("calls onSelect when folder title is clicked and does NOT collapse the folder", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderFolder({ onSelect });

    await user.click(screen.getByText("Tech News"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    // Clicking the title only navigates; the chevron is the toggle affordance.
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("collapses children when the chevron toggle is clicked, without calling onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderFolder({ onSelect });

    const toggle = screen.getByRole("button", { name: /toggle folder/i });
    await user.click(toggle);

    // Chevron toggles collapse and does NOT navigate.
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("chevron uses a color-only hover affordance, not a background box", () => {
    // The folder name and the chevron sit next to each other; a filled
    // hover rectangle on the chevron used to blur into the name's hover
    // background. The chevron now uses color-only transitions so the two
    // affordances read as distinct.
    renderFolder();
    const toggle = screen.getByRole("button", { name: /toggle folder/i });
    expect(toggle.className).not.toContain("hover:bg-sidebar-accent");
    expect(toggle.className).not.toContain("hover:bg-white/20");
    expect(toggle.className).toContain("hover:text-foreground");
  });

  it("chevron uses a brighter color hover on colored folders (no fill)", () => {
    const coloredFolder = { ...mockFolder, color: "#7c3aed" };
    render(
      <SidebarProvider>
        <FolderItem folder={coloredFolder} onDelete={vi.fn()} isSelected={false} onSelect={vi.fn()}>
          <div />
        </FolderItem>
      </SidebarProvider>
    );
    const toggle = screen.getByRole("button", { name: /toggle folder/i });
    expect(toggle.className).not.toContain("hover:bg-white/20");
    expect(toggle.className).toContain("hover:text-white");
  });

  it("marks the folder header active when isSelected is true", () => {
    renderFolder({ isSelected: true });
    const folderButton = screen
      .getByText("Tech News")
      .closest("[data-sidebar='menu-button']");
    expect(folderButton?.getAttribute("data-active")).toBe("true");
  });

  it("does not show feed count", () => {
    renderFolder();
    // No numeric count badge on the folder header
    const header = screen.getByText("Tech News").closest("button");
    expect(header?.textContent).not.toMatch(/\d+$/);
  });

  it("wraps children in a ul for valid HTML nesting", () => {
    renderFolderWithFeed();
    // The folder's collapsible content should contain a <ul> wrapping the feed <li> items
    const feedButton = screen.getByText("BBC News");
    const feedLi = feedButton.closest("li");
    expect(feedLi).not.toBeNull();
    // The feed <li> should be inside a <ul>, not directly inside the folder <li>
    expect(feedLi!.parentElement?.tagName).toBe("UL");
  });

  it("shows unread badge on feeds inside folders", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 24 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFolderWithFeed();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("renders unread badge via shadcn SidebarMenuBadge, consistent with unfiled feeds", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: Array.from({ length: 24 }, (_, i) => articleFixture(`a${i}`, false)),
      },
    });
    renderFolderWithFeed();
    // Feeds inside folders should use the same shadcn SidebarMenuBadge pattern
    // as unfiled feeds — consistency avoids two parallel badge implementations.
    const feedButton = screen.getByText("BBC News").closest("[data-sidebar='menu-button']");
    expect(feedButton!.textContent).not.toContain("24");
    const feedMenuItem = feedButton!.closest("[data-sidebar='menu-item']");
    const badge = feedMenuItem!.querySelector("[data-sidebar='menu-badge']");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain("24");
  });

  it("shows settings action on feeds inside folders", () => {
    renderFolderWithFeed();
    // There should be at least 2 "More" buttons: one for the folder, one for the feed
    const moreButtons = screen.getAllByRole("button", { name: /more|folder options/i });
    expect(moreButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("folder's root element is a <li> so it nests validly under SidebarMenu's <ul>", () => {
    renderFolderWithFeed();
    const parentList = screen.getByTestId("folder-parent-list");
    // Every direct child of a <ul> must be a <li> — otherwise we produce
    // invalid HTML (div-inside-ul) when rendered under SidebarMenu.
    for (const child of Array.from(parentList.children)) {
      expect(child.tagName).toBe("LI");
    }
  });

  describe("folder color customization", () => {
    it("folder title is bold (font-semibold)", () => {
      renderFolder();
      const btn = screen.getByText("Tech News").closest("[data-sidebar='menu-button']");
      expect(btn?.className).toContain("font-semibold");
    });

    it("applies colored background when folder has a color", () => {
      const coloredFolder = { ...mockFolder, color: "#7c3aed" };
      render(
        <SidebarProvider>
          <FolderItem folder={coloredFolder} onDelete={vi.fn()} isSelected={false} onSelect={vi.fn()}>
            <div />
          </FolderItem>
        </SidebarProvider>
      );
      const btn = screen.getByText("Tech News").closest("[data-sidebar='menu-button']");
      const style = (btn as HTMLElement)?.getAttribute("style") ?? "";
      expect(style).toContain("background");
    });

    it("applies white text when folder has a color", () => {
      const coloredFolder = { ...mockFolder, color: "#7c3aed" };
      render(
        <SidebarProvider>
          <FolderItem folder={coloredFolder} onDelete={vi.fn()} isSelected={false} onSelect={vi.fn()}>
            <div />
          </FolderItem>
        </SidebarProvider>
      );
      const btn = screen.getByText("Tech News").closest("[data-sidebar='menu-button']");
      const style = (btn as HTMLElement)?.getAttribute("style") ?? "";
      expect(style).toContain("color");
    });

    it("shows a color picker option in the dropdown", async () => {
      const user = userEvent.setup();
      renderFolder();
      const moreBtn = screen.getByRole("button", { name: /folder options/i });
      await user.click(moreBtn);
      expect(screen.getByTestId("folder-color-picker")).toBeInTheDocument();
    });
  });

  it("feed inside folder is not a DOM descendant of folder's menu-item (hover scope isolation)", () => {
    renderFolderWithFeed();
    // If the feed <li data-sidebar='menu-item'> is nested inside the folder's
    // <li data-sidebar='menu-item'>, CSS `group-hover/menu-item` leaks: hovering
    // the child feed also triggers hover on the folder's group, making the
    // folder's action dots appear at the same time. Each menu-item must own
    // its own hover scope.
    const folderMenuItem = screen
      .getByText("Tech News")
      .closest("[data-sidebar='menu-item']");
    const feedMenuItem = screen
      .getByText("BBC News")
      .closest("[data-sidebar='menu-item']");
    expect(folderMenuItem).not.toBeNull();
    expect(feedMenuItem).not.toBeNull();
    expect(folderMenuItem).not.toBe(feedMenuItem);
    expect(folderMenuItem!.contains(feedMenuItem)).toBe(false);
  });
});
