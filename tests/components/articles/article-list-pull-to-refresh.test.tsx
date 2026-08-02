import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { refreshFeed } from "@/core/feeds/feed-service.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
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
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  refreshAllFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/hooks/use-media-query.ts", () => ({
  useMediaQuery: vi.fn().mockReturnValue(false),
  useIsDesktop: vi.fn().mockReturnValue(false),
}));

const feed = {
  id: "f1",
  url: "https://f1.com/feed",
  title: "Feed 1",
  description: "",
  siteUrl: "https://f1.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const article = {
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Article 1",
  link: "https://f1.com/a1",
  content: "<p>c</p>",
  summary: "s",
  author: "",
  publishedAt: Date.now(),
  read: false,
  createdAt: Date.now(),
};

/** Drag from clientY=100 down past the 70px threshold, then release. */
function pullDown(el: HTMLElement, distance: number) {
  act(() => {
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientY: 100 } as Touch],
      }),
    );
  });
  act(() => {
    el.dispatchEvent(
      new TouchEvent("touchmove", {
        touches: [{ clientY: 100 + distance } as Touch],
      }),
    );
  });
  act(() => {
    el.dispatchEvent(new TouchEvent("touchend"));
  });
}

function renderList() {
  useFeedStore.setState({
    feeds: [feed],
    selectedFeedId: "f1",
    isLoading: false,
    isRefreshingAll: false,
    error: null,
  });
  useArticleStore.setState({
    articles: [article],
    articlesByFeedId: { f1: [article] },
    selectedArticle: null,
    isLoading: false,
  });
  const { container } = render(<ArticleList />);
  // The outermost scroll container owns the gesture.
  return container.firstElementChild as HTMLElement;
}

describe("ArticleList pull-to-refresh", () => {
  beforeEach(() => {
    installVirtualizerShims();
    vi.mocked(refreshFeed).mockClear();
    vi.mocked(useIsDesktop).mockReturnValue(false);
  });

  afterEach(() => {
    restoreVirtualizerShims();
  });

  it("pulling down past the threshold at the top refreshes the current view", async () => {
    const scrollEl = renderList();

    pullDown(scrollEl, 90);

    await vi.waitFor(() => {
      expect(refreshFeed).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(refreshFeed).mock.calls[0][0]).toMatchObject({
      id: "f1",
    });
  });

  it("a short pull below the threshold does nothing", () => {
    const scrollEl = renderList();

    pullDown(scrollEl, 40);

    expect(refreshFeed).not.toHaveBeenCalled();
  });

  it("shows the pull indicator while dragging", () => {
    const scrollEl = renderList();

    act(() => {
      scrollEl.dispatchEvent(
        new TouchEvent("touchstart", { touches: [{ clientY: 100 } as Touch] }),
      );
    });
    act(() => {
      scrollEl.dispatchEvent(
        new TouchEvent("touchmove", { touches: [{ clientY: 190 } as Touch] }),
      );
    });

    expect(screen.getByTestId("pull-to-refresh-indicator")).toBeInTheDocument();

    act(() => {
      scrollEl.dispatchEvent(new TouchEvent("touchend"));
    });
  });

  it("does not attach the gesture on desktop", async () => {
    vi.mocked(useIsDesktop).mockReturnValue(true);
    const scrollEl = renderList();

    pullDown(scrollEl, 90);

    expect(refreshFeed).not.toHaveBeenCalled();
  });
});
