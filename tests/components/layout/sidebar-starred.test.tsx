import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { STARRED_FEED_ID } from "@feedzero/core/utils/constants";
import type { Article, Feed } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("@/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { extracted: 0, failed: 0 } }),
}));

function buildFeed(id: string): Feed {
  return {
    id,
    url: `https://${id}.com/feed`,
    title: id,
    description: "",
    siteUrl: `https://${id}.com`,
    createdAt: 0,
    updatedAt: 0,
  };
}

function buildArticle(id: string, feedId: string, starred = false): Article {
  return {
    id,
    feedId,
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: 1,
    read: false,
    createdAt: 0,
    starred,
  };
}

function renderSidebar(onFeedSelect?: (feedId: string) => void) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar onFeedSelect={onFeedSelect} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar Starred entry", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [buildFeed("f1"), buildFeed("f2")],
      selectedFeedId: null,
      isLoading: false,
      error: null,
      isRefreshingAll: false,
      refreshingFeedIds: new Set(),
    });
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
  });

  it("does not render when no articles are starred", () => {
    renderSidebar();

    expect(screen.queryByTestId("sidebar-starred-link")).toBeNull();
  });

  it("appears once the user has at least one starred article", () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [buildArticle("a1", "f1", true), buildArticle("a2", "f1", false)],
      },
    });

    renderSidebar();

    expect(screen.getByTestId("sidebar-starred-link")).toBeInTheDocument();
  });

  it("calls onFeedSelect with STARRED_FEED_ID when clicked", async () => {
    useArticleStore.setState({
      articlesByFeedId: { f1: [buildArticle("a1", "f1", true)] },
    });
    const onFeedSelect = vi.fn();
    renderSidebar(onFeedSelect);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("sidebar-starred-link"));

    expect(onFeedSelect).toHaveBeenCalledWith(STARRED_FEED_ID);
  });
});
