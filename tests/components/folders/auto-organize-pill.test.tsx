import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  updateFeed: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/stores/sync-store", () => ({
  useSyncStore: {
    getState: () => ({ scheduleSyncPush: vi.fn() }),
  },
}));

function makeFeed(id: string, folderId?: string) {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    folderId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function setFeeds(count: number, foldered = 0) {
  const feeds: ReturnType<typeof makeFeed>[] = [];
  for (let i = 0; i < count; i++) {
    feeds.push(makeFeed(`f${i}`, i < foldered ? "fold-x" : undefined));
  }
  useFeedStore.setState({ feeds, folders: [] });
}

describe("AutoOrganizePill", () => {
  beforeEach(() => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
  });

  it("renders when there are more than 10 feeds and at least one is unfiled", () => {
    setFeeds(12, 0);
    render(<AutoOrganizePill />);
    expect(screen.getByTestId("auto-organize-pill")).toBeInTheDocument();
  });

  it("does not render when there are 10 or fewer feeds", () => {
    setFeeds(10, 0);
    render(<AutoOrganizePill />);
    expect(screen.queryByTestId("auto-organize-pill")).toBeNull();
  });

  it("does not render when all feeds are already in folders", () => {
    setFeeds(15, 15);
    render(<AutoOrganizePill />);
    expect(screen.queryByTestId("auto-organize-pill")).toBeNull();
  });

  it("clicking the pill opens the auto-organize dialog", async () => {
    const user = userEvent.setup();
    setFeeds(12, 0);
    render(<AutoOrganizePill />);

    await user.click(screen.getByTestId("auto-organize-pill"));

    expect(
      screen.getByRole("heading", { name: /Auto-organize feeds/i }),
    ).toBeInTheDocument();
  });
});
