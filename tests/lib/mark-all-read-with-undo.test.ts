import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { markAllReadWithUndo } from "@/lib/mark-all-read-with-undo.ts";
import { useArticleStore } from "@/stores/article-store.ts";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

vi.mock("@/core/storage/db.ts", () => ({
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

function articleFixture(id: string, read: boolean) {
  return {
    id,
    feedId: "f1",
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: Date.now(),
    read,
    createdAt: Date.now(),
  };
}

describe("markAllReadWithUndo", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
  });

  it("marks everything read and offers an Undo action in the toast", async () => {
    const a1 = articleFixture("a1", false);
    const a2 = articleFixture("a2", false);
    useArticleStore.setState({
      articles: [a1, a2],
      articlesByFeedId: { f1: [a1, a2] },
    });

    await markAllReadWithUndo();

    expect(useArticleStore.getState().articles.every((a) => a.read)).toBe(true);
    expect(toast).toHaveBeenCalledWith(
      "Marked 2 read",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("undo restores exactly the articles that were marked", async () => {
    const a1 = articleFixture("a1", false);
    const a2 = articleFixture("a2", true);
    useArticleStore.setState({
      articles: [a1, a2],
      articlesByFeedId: { f1: [a1, a2] },
    });

    await markAllReadWithUndo();
    const options = vi.mocked(toast).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    // markUnread is async; give it a tick to settle.
    await vi.waitFor(() => {
      const state = useArticleStore.getState();
      expect(state.articles.find((a) => a.id === "a1")?.read).toBe(false);
    });

    // a2 was already read before the sweep — undo must not resurrect it.
    expect(
      useArticleStore.getState().articles.find((a) => a.id === "a2")?.read,
    ).toBe(true);
  });

  it("shows no toast when there was nothing unread", async () => {
    const a1 = articleFixture("a1", true);
    useArticleStore.setState({
      articles: [a1],
      articlesByFeedId: { f1: [a1] },
    });

    await markAllReadWithUndo();

    expect(toast).not.toHaveBeenCalled();
  });
});
