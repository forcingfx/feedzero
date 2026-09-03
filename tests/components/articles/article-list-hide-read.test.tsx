/**
 * "Hide read articles" — the unread-only reading mode.
 *
 * Requested so a finished session leaves an empty list rather than a
 * wall of greyed-out rows. Pairs with the existing "Mark N read" pill:
 * sweep, and the view empties.
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

const article = (id: string, title: string, read: boolean) => ({
  id,
  feedId: "f1",
  guid: id,
  title,
  link: `https://example.com/${id}`,
  content: "<p>content</p>",
  summary: "summary",
  author: "Author",
  // Distinct timestamps keep flood-grouping out of the picture.
  publishedAt: Date.now() - Number(id.slice(1)) * 86_400_000,
  read,
  createdAt: Date.now(),
});

const feed = {
  id: "f1",
  url: "https://f1.com/feed",
  title: "Feed 1",
  description: "",
  siteUrl: "https://f1.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function setHideRead(hideReadArticles: boolean) {
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, hideReadArticles },
  });
}

describe("ArticleList — hide read articles", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useAppStore.setState({ groupArticleFloods: false });
    useFeedStore.setState({
      feeds: [feed],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [],
      selectedArticle: null,
      isLoading: false,
    });
    setHideRead(false);
  });

  afterEach(() => {
    restoreVirtualizerShims();
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it("shows read articles when the preference is off", () => {
    useArticleStore.setState({
      articles: [article("a1", "Unread one", false), article("a2", "Read one", true)],
    });

    render(<ArticleList />);

    expect(screen.getByText("Unread one")).toBeInTheDocument();
    expect(screen.getByText("Read one")).toBeInTheDocument();
  });

  it("hides read articles when the preference is on", () => {
    setHideRead(true);
    useArticleStore.setState({
      articles: [article("a1", "Unread one", false), article("a2", "Read one", true)],
    });

    render(<ArticleList />);

    expect(screen.getByText("Unread one")).toBeInTheDocument();
    expect(screen.queryByText("Read one")).toBeNull();
  });

  it("keeps the article you are currently reading visible after it flips to read", () => {
    setHideRead(true);
    const reading = article("a2", "Read one", true);
    useArticleStore.setState({
      articles: [article("a1", "Unread one", false), reading],
      selectedArticle: reading as never,
    });

    render(<ArticleList />);

    // Auto-mark-as-read fires the moment you open an article; yanking it
    // out from under the reader would be hostile.
    expect(screen.getByText("Read one")).toBeInTheDocument();
  });

  it("shows a caught-up empty state once everything in the view is read", () => {
    setHideRead(true);
    useArticleStore.setState({
      articles: [article("a1", "Read one", true), article("a2", "Read two", true)],
    });

    render(<ArticleList />);

    expect(screen.getByTestId("caught-up-empty")).toBeInTheDocument();
    // Not the "this feed hasn't loaded / refresh me" state — there is
    // nothing wrong here, the user is simply done.
    expect(screen.queryByTestId("empty-refresh")).toBeNull();
  });

  it("still shows the refresh path for a genuinely empty feed", () => {
    setHideRead(true);
    useArticleStore.setState({ articles: [] });

    render(<ArticleList />);

    expect(screen.getByTestId("empty-refresh")).toBeInTheDocument();
    expect(screen.queryByTestId("caught-up-empty")).toBeNull();
  });
});
