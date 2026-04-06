import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderItem } from "@/components/sidebar/folder-item.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";

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

function renderFolder(props: Partial<React.ComponentProps<typeof FolderItem>> = {}) {
  return render(
    <SidebarProvider>
      <FolderItem
        folder={mockFolder}
        onDelete={vi.fn()}
        {...props}
      >
        <div data-testid="child-content">Child feeds here</div>
      </FolderItem>
    </SidebarProvider>
  );
}

describe("FolderItem", () => {
  beforeEach(() => {
    useFeedStore.setState({ folders: [mockFolder] });
  });

  it("renders the folder name", () => {
    renderFolder();
    expect(screen.getByText("Tech News")).toBeInTheDocument();
  });

  it("renders children when expanded (default open)", () => {
    renderFolder();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("collapses children when header is clicked", async () => {
    const user = userEvent.setup();
    renderFolder();

    await user.click(screen.getByText("Tech News"));

    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });

  it("does not show feed count", () => {
    renderFolder();
    // No numeric count badge on the folder header
    const header = screen.getByText("Tech News").closest("button");
    expect(header?.textContent).not.toMatch(/\d+$/);
  });
});
