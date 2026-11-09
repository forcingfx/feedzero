/**
 * Audit 2026-Q4, finding 4. "Mark N read" used to float over the list and
 * covered the last visible row. It is now a header action: an icon button
 * in the desktop title bar, an entry in the mobile view-options menu. Both
 * run the same undo-able sweep.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ArticleListControls } from "@/components/articles/article-list-controls.tsx";
import { ViewOptionsPill } from "@/components/articles/view-options-pill.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getPreferences: vi.fn().mockResolvedValue({ ok: true, value: null }),
  putPreferences: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));
vi.mock("@/core/sync/sync-service", () => ({ pushVault: vi.fn(), pullVault: vi.fn(), importVault: vi.fn() }));
vi.mock("@/core/feeds/feed-service.ts", () => ({ addFeedFlow: vi.fn(), refreshFeed: vi.fn(), refreshAllFeeds: vi.fn() }));
let mobile = false;
vi.mock("@/hooks/use-mobile.ts", () => ({ useIsMobile: () => mobile }));

const feed = { id: "f1", url: "https://f1.com/rss", title: "Feed 1", description: "", siteUrl: "https://f1.com", createdAt: 0, updatedAt: 0 };
const article = (id: string, read = false) => ({ id, feedId: "f1", guid: id, title: id, link: `https://f1.com/${id}`, content: "", summary: "", author: "", publishedAt: 1, read, createdAt: 1 });

function seed(unread: number) {
  const articles = [article("a", unread < 1), article("b", unread < 2)];
  useFeedStore.setState({ feeds: [feed], selectedFeedId: "f1", isLoading: false, error: null });
  useArticleStore.setState({ articles, articlesByFeedId: { f1: articles }, selectedArticle: null, isLoading: false });
}

describe("Mark all read as a header action", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    mobile = false;
  });

  it("desktop: the title bar offers 'Mark 2 read' and the sweep is undoable", async () => {
    seed(2);
    render(<MemoryRouter><ArticleListControls sortMode="newest" onSortChange={() => {}} /></MemoryRouter>);

    await userEvent.click(screen.getByRole("button", { name: /mark 2 read/i }));

    await waitFor(() => expect(useArticleStore.getState().articles.every((a) => a.read)).toBe(true));
    expect(toast).toHaveBeenCalledWith("Marked 2 read", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));
  });

  it("desktop: the action is absent when nothing is unread", () => {
    seed(0);
    render(<MemoryRouter><ArticleListControls sortMode="newest" onSortChange={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /mark .* read/i })).toBeNull();
  });

  it("mobile: the view-options menu carries 'Mark 2 read'", async () => {
    mobile = true;
    seed(2);
    render(<MemoryRouter><ViewOptionsPill /></MemoryRouter>);

    await userEvent.click(screen.getByRole("button", { name: /view options/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /mark 2 read/i }));

    await waitFor(() => expect(useArticleStore.getState().articles.every((a) => a.read)).toBe(true));
  });
});
