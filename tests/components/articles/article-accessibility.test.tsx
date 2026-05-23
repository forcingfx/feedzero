import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ArticleItem } from "@/components/articles/article-item.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import type { Article } from "@feedzero/core/types";
import {
  installVirtualizerShims,
  restoreVirtualizerShims,
} from "../../helpers/virtualizer-shims.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

const mockArticle = (id: string, title: string, read = false): Article => ({
  id,
  feedId: "f1",
  guid: id,
  title,
  link: `https://example.com/${id}`,
  content: "<p>content</p>",
  summary: "summary",
  author: "Author",
  publishedAt: Date.now(),
  read,
  createdAt: Date.now(),
});

describe("ArticleList accessibility", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useFeedStore.setState({
      feeds: [],
      selectedFeedId: "f1",
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({
      articles: [mockArticle("a1", "First"), mockArticle("a2", "Second")],
      selectedArticle: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    restoreVirtualizerShims();
  });

  it("renders ul with role listbox", () => {
    render(<ArticleList />);
    const list = screen.getByRole("listbox");
    expect(list.tagName).toBe("UL");
  });

  it("has aria-label Articles", () => {
    render(<ArticleList />);
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-label",
      "Articles",
    );
  });

  it("each item has role option", () => {
    render(<ArticleList />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
  });

  it("selected article has aria-selected true", () => {
    useArticleStore.setState({
      articles: [mockArticle("a1", "First"), mockArticle("a2", "Second")],
      selectedArticle: mockArticle("a1", "First"),
      isLoading: false,
    });
    render(<ArticleList />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("each item has tabIndex 0", () => {
    render(<ArticleList />);
    const options = screen.getAllByRole("option");
    for (const option of options) {
      expect(option).toHaveAttribute("tabindex", "0");
    }
  });

  it("each item has data-id attribute", () => {
    render(<ArticleList />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("data-id", "a1");
    expect(options[1]).toHaveAttribute("data-id", "a2");
  });
});

describe("ArticleItem keyboard interaction", () => {
  it("Enter key fires onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const article = mockArticle("a1", "Test");
    render(
      <ArticleItem article={article} isSelected={false} onSelect={onSelect} />,
    );
    const item = screen.getByRole("option");
    await user.click(item);
    onSelect.mockClear();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(article);
  });

  it("Space key does not fire onSelect (reserved for scrolling reader)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const article = mockArticle("a1", "Test");
    render(
      <ArticleItem article={article} isSelected={false} onSelect={onSelect} />,
    );
    const item = screen.getByRole("option");
    await user.click(item);
    onSelect.mockClear();
    await user.keyboard(" ");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("unread articles have text-foreground on title", () => {
    const onSelect = vi.fn();
    render(
      <ArticleItem
        article={mockArticle("a1", "Unread", false)}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("Unread").className).toContain("text-foreground");
  });

  it("selected article has accent background", () => {
    const onSelect = vi.fn();
    render(
      <ArticleItem
        article={mockArticle("a1", "Selected")}
        isSelected={true}
        onSelect={onSelect}
      />,
    );
    const item = screen.getByRole("option");
    expect(item.className).toContain("aria-selected:bg-accent");
  });
});
