/**
 * Issue #340: the list shows an article's lead image only when the user
 * has turned "Show article images" on. Off is the default: every row's
 * image is a request to a third-party host, which tells that host what
 * the reader is looking at.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
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

const IMAGE = "https://cdn.example.com/lead.jpg";

function seed() {
  useFeedStore.setState({
    feeds: [{ id: "f1", url: "https://f1.com/feed", title: "F1", description: "", siteUrl: "https://f1.com", createdAt: 0, updatedAt: 0 }],
    selectedFeedId: "f1",
    isLoading: false,
    error: null,
  });
  useArticleStore.setState({
    articles: [
      { id: "a", feedId: "f1", guid: "a", title: "With image", link: "https://f1.com/a", content: "", summary: "", author: "", publishedAt: 2, read: false, createdAt: 2, imageUrl: IMAGE },
      { id: "b", feedId: "f1", guid: "b", title: "Without image", link: "https://f1.com/b", content: "", summary: "", author: "", publishedAt: 1, read: false, createdAt: 1 },
    ],
    selectedArticle: null,
    isLoading: false,
  });
}

describe("ArticleList: article images", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useAppStore.setState({ groupArticleFloods: false });
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
    seed();
  });
  afterEach(() => {
    restoreVirtualizerShims();
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it("renders no images by default", () => {
    render(<ArticleList />);
    expect(screen.queryByTestId("article-image")).toBeNull();
  });

  it("renders the lead image through the proxy once the setting is on", () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES, showArticleImages: true } });
    render(<ArticleList />);
    const imgs = screen.getAllByTestId("article-image");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", `/api/icon?url=${encodeURIComponent(IMAGE)}`);
  });
});
