import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarFeedList } from "@/components/sidebar/sidebar-feed-list.tsx";
import { SidebarProvider, SidebarMenu } from "@/components/ui/sidebar.tsx";
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

function renderList() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SidebarMenu>
          <SidebarFeedList onFeedSelect={vi.fn()} />
        </SidebarMenu>
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe("SidebarFeedList", () => {
  beforeEach(() => {
    useArticleStore.setState({ unreadCounts: {} });
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
});
