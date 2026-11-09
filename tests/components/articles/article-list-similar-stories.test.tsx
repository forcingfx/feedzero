/**
 * Issue #343: in a folder with "Collapse similar stories" on, near-identical
 * headlines from several feeds fold under the newest copy with an
 * "Also in N more sources" row (owner's call 2a). Opening the lead marks
 * the folded copies read (3a). Free (4a).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { toFolderFeedId } from "@feedzero/core/utils/constants";
import type { Article, Folder } from "@feedzero/core/types";
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

const T0 = 1_700_000_000_000;
function article(id: string, title: string, feedId: string, minutesAgo: number): Article {
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "<p>content</p>",
    summary: "summary",
    author: "",
    publishedAt: T0 - minutesAgo * 60_000,
    read: false,
    createdAt: T0,
  };
}
function feed(id: string, folderId: string) {
  return {
    id,
    url: `https://${id}.com/feed`,
    title: id.toUpperCase(),
    description: "",
    siteUrl: `https://${id}.com`,
    folderId,
    createdAt: 0,
    updatedAt: 0,
  };
}

const lead = article("a", "Fed raises interest rates by quarter point", "f1", 1);
const dupeB = article("b", "Fed raises rates a quarter point", "f2", 2);
const dupeC = article("c", "Federal Reserve raises interest rates by a quarter point", "f3", 3);
const other = article("d", "Local bakery wins national award", "f1", 4);

function setFolder(folderOverrides: Partial<Folder>) {
  useFeedStore.setState({
    feeds: [feed("f1", "news"), feed("f2", "news"), feed("f3", "news")],
    folders: [{ id: "news", name: "News", createdAt: 0, ...folderOverrides }],
    selectedFeedId: toFolderFeedId("news"),
    isLoading: false,
    error: null,
  });
  useArticleStore.setState({
    articles: [lead, dupeB, dupeC, other],
    selectedArticle: null,
    isLoading: false,
  });
}

describe("ArticleList: collapse similar stories", () => {
  beforeEach(() => {
    installVirtualizerShims();
    useAppStore.setState({ groupArticleFloods: false });
  });
  afterEach(() => restoreVirtualizerShims());

  it("shows every copy when the folder has the setting off", () => {
    setFolder({});
    render(<ArticleList />);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /similar stories/i })).toBeNull();
  });

  it("folds duplicates under the newest copy with an 'Also in N more sources' row", () => {
    setFolder({ collapseSimilar: "normal" });
    render(<ArticleList />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Fed raises interest rates by quarter point");
    expect(screen.getByRole("button", { name: /show 2 similar stories/i })).toHaveTextContent(
      /also in 2 more sources/i,
    );
  });

  it("expands and collapses the folded copies on click", async () => {
    setFolder({ collapseSimilar: "normal" });
    render(<ArticleList />);

    await userEvent.click(screen.getByRole("button", { name: /show 2 similar stories/i }));
    expect(screen.getAllByRole("option")).toHaveLength(4);

    await userEvent.click(screen.getByRole("button", { name: /collapse similar stories/i }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("opening the lead marks its folded copies read", async () => {
    setFolder({ collapseSimilar: "normal" });
    render(<ArticleList />);

    await userEvent.click(screen.getAllByRole("option")[0]!);

    await vi.waitFor(() => {
      const byId = Object.fromEntries(useArticleStore.getState().articles.map((a) => [a.id, a]));
      expect(byId.b?.read).toBe(true);
      expect(byId.c?.read).toBe(true);
      expect(byId.d?.read).toBe(false);
    });
  });

  it("a subfolder inherits the parent's setting", () => {
    useFeedStore.setState({
      feeds: [feed("f1", "europe"), feed("f2", "europe"), feed("f3", "europe")],
      folders: [
        { id: "world", name: "World", createdAt: 0, collapseSimilar: "normal" },
        { id: "europe", name: "Europe", createdAt: 0, parentId: "world" },
      ],
      selectedFeedId: toFolderFeedId("europe"),
      isLoading: false,
      error: null,
    });
    useArticleStore.setState({ articles: [lead, dupeB, dupeC, other], selectedArticle: null, isLoading: false });
    render(<ArticleList />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });
});
