/**
 * The reader's "Aa" menu (owner request, 2026-11-20): text size, line
 * spacing and width, adjusted while looking at a real article. These
 * were only in Settings, where a preview had to stand in for one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn(),
  updateArticle: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getPreferences: vi.fn().mockResolvedValue({ ok: true, value: null }),
  putPreferences: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
  needsExtraction: vi.fn().mockReturnValue(false),
}));

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query.ts", () => ({
  useIsDesktop: () => mockIsDesktop,
}));

const article = {
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Test Article",
  link: "https://example.com/post",
  content: "<p>Body text of the article.</p>",
  summary: "",
  author: "",
  publishedAt: Date.now(),
  read: true,
  createdAt: Date.now(),
};

async function openMenu() {
  const user = userEvent.setup();
  render(<ReaderPanel />);
  await user.click(screen.getByRole("button", { name: "Text settings" }));
  return { user, menu: await screen.findByRole("dialog", { name: "Text settings" }) };
}

describe("reader Aa menu", () => {
  beforeEach(() => {
    mockIsDesktop = true;
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
    useFeedStore.setState({ feeds: [], folders: [], selectedFeedId: "f1" });
    useArticleStore.setState({ selectedArticle: article as never, articles: [], isLoading: false });
  });

  it("sits in the reader's action row", () => {
    render(<ReaderPanel />);
    const row = screen.getByTestId("reader-action-row");
    expect(within(row).getByRole("button", { name: "Text settings" })).toHaveTextContent("Aa");
  });

  it("stepping the text size changes the article on screen and persists", async () => {
    const { user, menu } = await openMenu();
    const column = screen.getByTestId("article-content-area").querySelector("article")!;
    expect(column.className).toContain("reading-size-medium");

    await user.click(within(menu).getByRole("button", { name: "Increase text size" }));

    expect(column.className).toContain("reading-size-large");
    expect(usePreferencesStore.getState().preferences.readerTextSize).toBe("large");
    // Still open: the point is to keep adjusting while reading.
    expect(screen.getByRole("dialog", { name: "Text settings" })).toBeInTheDocument();
  });

  it("changes line spacing", async () => {
    const { user, menu } = await openMenu();

    await user.click(
      within(within(menu).getByRole("group", { name: "Line spacing" })).getByRole("button", {
        name: "Relaxed",
      }),
    );

    expect(usePreferencesStore.getState().preferences.readerLineHeight).toBe("relaxed");
  });

  it("offers reading width on desktop", async () => {
    const { user, menu } = await openMenu();

    await user.click(
      within(within(menu).getByRole("group", { name: "Reading width" })).getByRole("button", {
        name: "Wide",
      }),
    );

    expect(usePreferencesStore.getState().preferences.readerWidth).toBe("wide");
  });

  // Pin: on a phone the article fills the screen at every width, so a
  // width control there would be four buttons that do nothing.
  it("leaves reading width out on a phone", async () => {
    mockIsDesktop = false;
    const { menu } = await openMenu();
    expect(within(menu).queryByRole("group", { name: "Reading width" })).toBeNull();
    expect(within(menu).getByRole("group", { name: "Line spacing" })).toBeInTheDocument();
  });
});
