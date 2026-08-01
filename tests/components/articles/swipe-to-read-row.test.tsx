import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SwipeToReadRow } from "@/components/articles/swipe-to-read-row.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
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
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

vi.mock("@/hooks/use-media-query.ts", () => ({
  useMediaQuery: vi.fn().mockReturnValue(false),
  useIsDesktop: vi.fn().mockReturnValue(false),
}));

const article = (read = false) => ({
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Swipeable",
  link: "https://example.com/a1",
  content: "<p>c</p>",
  summary: "s",
  author: "",
  publishedAt: Date.now(),
  read,
  createdAt: Date.now(),
});

function seed(read = false) {
  const a = article(read);
  useArticleStore.setState({
    articles: [a],
    articlesByFeedId: { f1: [a] },
    selectedArticle: null,
    isLoading: false,
  });
  return a;
}

function touch(el: Element, type: string, x: number, y: number) {
  act(() => {
    el.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches:
          type === "touchend"
            ? []
            : [
                new Touch({
                  identifier: 1,
                  target: el,
                  clientX: x,
                  clientY: y,
                }),
              ],
      }),
    );
  });
}

/** Drag from (x0,y0) to (x1,y1) with an intermediate step, then release. */
function drag(el: Element, x0: number, y0: number, x1: number, y1: number) {
  touch(el, "touchstart", x0, y0);
  touch(el, "touchmove", (x0 + x1) / 2, (y0 + y1) / 2);
  touch(el, "touchmove", x1, y1);
  touch(el, "touchend", x1, y1);
}

function renderRow(read = false) {
  const a = seed(read);
  render(
    <SwipeToReadRow article={a} enabled>
      <div data-testid="row-content">{a.title}</div>
    </SwipeToReadRow>,
  );
  return screen.getByTestId("swipe-to-read-row");
}

describe("SwipeToReadRow", () => {
  it("rightward swipe past the threshold marks an unread article read", async () => {
    const row = renderRow(false);

    drag(row, 100, 100, 200, 104);

    await vi.waitFor(() => {
      expect(useArticleStore.getState().articles[0].read).toBe(true);
    });
  });

  it("rightward swipe on a read article restores unread", async () => {
    const row = renderRow(true);

    drag(row, 100, 100, 200, 104);

    await vi.waitFor(() => {
      expect(useArticleStore.getState().articles[0].read).toBe(false);
    });
  });

  it("translates the row content while dragging (visible feedback)", () => {
    const row = renderRow(false);

    touch(row, "touchstart", 100, 100);
    touch(row, "touchmove", 160, 102);

    const content = screen.getByTestId("row-content").parentElement!;
    expect(content.getAttribute("style") ?? "").toContain("translateX");

    touch(row, "touchend", 160, 102);
  });

  it("a short rightward swipe snaps back without committing", () => {
    const row = renderRow(false);

    drag(row, 100, 100, 130, 102);

    expect(useArticleStore.getState().articles[0].read).toBe(false);
  });

  it("leftward swipes never commit — the pager owns leftward", () => {
    const row = renderRow(false);

    drag(row, 200, 100, 80, 104);

    expect(useArticleStore.getState().articles[0].read).toBe(false);
  });

  it("vertical-dominant drags are left to the scroll container", () => {
    const row = renderRow(false);

    drag(row, 100, 100, 130, 220);

    expect(useArticleStore.getState().articles[0].read).toBe(false);
  });

  it("renders children without gesture chrome when disabled (desktop)", () => {
    const a = seed(false);
    render(
      <SwipeToReadRow article={a} enabled={false}>
        <div data-testid="row-content">{a.title}</div>
      </SwipeToReadRow>,
    );
    expect(screen.queryByTestId("swipe-to-read-row")).toBeNull();
    expect(screen.getByTestId("row-content")).toBeInTheDocument();
  });
});

describe("ArticleList swipe integration", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useFeedStore.setState({
      feeds: [
        {
          id: "f1",
          url: "https://f1.com/feed",
          title: "Feed 1",
          description: "",
          siteUrl: "https://f1.com",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      selectedFeedId: "f1",
      isLoading: false,
      isRefreshingAll: false,
      error: null,
    });
  });

  afterEach(() => {
    restoreVirtualizerShims();
  });

  it("wraps article rows in the swipe gesture on mobile", () => {
    seed(false);
    render(<ArticleList />);
    expect(screen.getByTestId("swipe-to-read-row")).toBeInTheDocument();
  });
});
