/**
 * "Show feed icons" — the per-row favicon in aggregated article lists.
 *
 * Requested as a density/minimalism control: in an all-items or folder
 * view every row carries its source favicon, which some readers want
 * gone. Single-feed views never showed one (the feed is already the
 * heading), so the preference only has anything to hide in aggregated
 * views.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import { ALL_FEEDS_ID } from "@feedzero/core/utils/constants";
import {
  installVirtualizerShims,
  restoreVirtualizerShims,
} from "../../helpers/virtualizer-shims.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

const feed = {
  id: "f1",
  url: "https://f1.com/feed",
  title: "Feed 1",
  description: "",
  siteUrl: "https://f1.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const articles = [
  {
    id: "a1",
    feedId: "f1",
    guid: "a1",
    title: "Only article",
    link: "https://f1.com/a1",
    content: "<p>content</p>",
    summary: "summary",
    author: "Author",
    publishedAt: Date.now(),
    read: false,
    createdAt: Date.now(),
  },
];

function renderAggregated(showArticleFeedIcons: boolean) {
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, showArticleFeedIcons },
  });
  useFeedStore.setState({
    feeds: [feed],
    selectedFeedId: ALL_FEEDS_ID,
    isLoading: false,
    error: null,
  });
  useArticleStore.setState({
    articles: articles as never,
    selectedArticle: null,
    isLoading: false,
  });
  return render(<ArticleList />);
}

describe("ArticleList — feed icons", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useAppStore.setState({ groupArticleFloods: false });
  });

  afterEach(() => {
    restoreVirtualizerShims();
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it("shows the source favicon in an aggregated view by default", () => {
    const { container } = renderAggregated(true);
    expect(screen.getByTestId("article-item-side")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("drops the favicon — and its whole column — when the preference is off", () => {
    const { container } = renderAggregated(false);
    expect(container.querySelector("img")).toBeNull();
    // An empty side column would keep stealing gap from the title, which
    // defeats the point of asking for a tighter row.
    expect(screen.queryByTestId("article-item-side")).toBeNull();
  });

  it("keeps the feed name when the icon is hidden", () => {
    renderAggregated(false);
    expect(screen.getByText(/Feed 1/)).toBeInTheDocument();
  });
});
