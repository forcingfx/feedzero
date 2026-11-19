import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  noteFullTextRequest,
  resetFullTextRequestSession,
} from "@/lib/suggest-always-full-text.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";

vi.mock("sonner", () => ({ toast: vi.fn() }));

const feed = (overrides: Record<string, unknown> = {}) => ({
  id: "f1",
  url: "https://example.com/feed",
  title: "The Globe and Mail",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const article = (id: string, feedId = "f1") =>
  ({ id, feedId, guid: id, title: id, link: `https://example.com/${id}` }) as never;

/**
 * Pin: the nudge comes on the second article of a feed the reader asks
 * full text for, and once per feed, ever. One request is curiosity, two
 * is a habit; asking again after it was ignored would be nagging.
 */
describe("noteFullTextRequest", () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
    localStorage.clear();
    resetFullTextRequestSession();
    useFeedStore.setState({ feeds: [feed()] as never, folders: [] });
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it("says nothing the first time", () => {
    noteFullTextRequest(article("a1"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("offers to always open the feed in full text on the second article", () => {
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a2"));

    expect(toast).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast).mock.calls[0]!;
    expect(message).toBe("Always open The Globe and Mail in full text?");
    expect((options as { action: { label: string } }).action.label).toBe("Always");
  });

  it("does not count flipping the same article back and forth", () => {
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a1"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("counts across reloads", () => {
    noteFullTextRequest(article("a1"));
    resetFullTextRequestSession();
    noteFullTextRequest(article("a2"));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("asks once per feed, even after a reload", () => {
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a2"));
    resetFullTextRequestSession();
    noteFullTextRequest(article("a3"));
    noteFullTextRequest(article("a4"));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("counts each feed on its own", () => {
    useFeedStore.setState({ feeds: [feed(), feed({ id: "f2", title: "CBC" })] as never });
    noteFullTextRequest(article("a1", "f1"));
    noteFullTextRequest(article("b1", "f2"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet for a feed that already opens in full text", () => {
    useFeedStore.setState({ feeds: [feed({ preferFullText: true })] as never });
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a2"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet when full text is already the app-wide default", () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, openArticlesIn: "full-text" },
    });
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a2"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("choosing Always turns the feed's setting on and confirms it", async () => {
    const setFeedPreferFullText = vi.fn().mockResolvedValue(undefined);
    useFeedStore.setState({ setFeedPreferFullText });
    noteFullTextRequest(article("a1"));
    noteFullTextRequest(article("a2"));

    const options = vi.mocked(toast).mock.calls[0]![1] as unknown as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    await Promise.resolve();

    expect(setFeedPreferFullText).toHaveBeenCalledWith("f1", true);
    expect(vi.mocked(toast).mock.calls.at(-1)![0]).toMatch(/now opens in full text/);
  });

  it("ignores an article whose feed is gone", () => {
    noteFullTextRequest(article("x1", "missing"));
    noteFullTextRequest(article("x2", "missing"));
    expect(toast).not.toHaveBeenCalled();
  });
});
