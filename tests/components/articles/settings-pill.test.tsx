/**
 * SettingsPill — the floating cog. Context-aware: clicks dispatch to
 * the right settings dialog based on selectedFeedId type, and the
 * pill hides itself entirely on aggregated views that have nothing
 * to configure (ALL_FEEDS, STARRED).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPill } from "@/components/articles/settings-pill.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import {
  ALL_FEEDS_ID,
  STARRED_FEED_ID,
  toFolderFeedId,
  toFilterFeedId,
} from "@feedzero/core/utils/constants";
import type { Feed, Folder, SmartFilter } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
  addFolder: vi.fn(),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addSmartFilter: vi.fn(),
  updateSmartFilter: vi.fn(),
  removeSmartFilter: vi.fn(),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

function feed(id: string, title: string): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    title,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

function folder(id: string, name: string): Folder {
  return { id, name, createdAt: 0 };
}

function smartFilter(id: string, name: string): SmartFilter {
  return {
    id,
    name,
    rule: { kind: "group", match: "all", children: [] },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("SettingsPill", () => {
  let openFeedSettings: ReturnType<typeof vi.fn>;
  let openFolderSettings: ReturnType<typeof vi.fn>;
  let openEditor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openFeedSettings = vi.fn();
    openFolderSettings = vi.fn();
    openEditor = vi.fn();
    useFeedStore.setState({
      feeds: [feed("f-tech", "Tech Crunchies")],
      folders: [folder("folder-tech", "Tech")],
      selectedFeedId: null,
      openFeedSettings,
      openFolderSettings,
    });
    useSmartFilterStore.setState({
      filters: [smartFilter("filter-recent", "Recent")],
      openEditor,
    });
  });

  it("hides on ALL_FEEDS view", () => {
    useFeedStore.setState({ selectedFeedId: ALL_FEEDS_ID });
    const { container } = render(<SettingsPill />);
    expect(container.firstChild).toBeNull();
  });

  it("hides on STARRED view", () => {
    useFeedStore.setState({ selectedFeedId: STARRED_FEED_ID });
    const { container } = render(<SettingsPill />);
    expect(container.firstChild).toBeNull();
  });

  it("hides when no feed is selected", () => {
    useFeedStore.setState({ selectedFeedId: null });
    const { container } = render(<SettingsPill />);
    expect(container.firstChild).toBeNull();
  });

  it("on a single feed, clicking opens the feed settings dialog", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ selectedFeedId: "f-tech" });
    render(<SettingsPill />);
    await user.click(screen.getByTestId("settings-pill"));
    expect(openFeedSettings).toHaveBeenCalledWith("f-tech");
  });

  it("on a folder view, clicking opens the folder settings dialog with that folder id", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ selectedFeedId: toFolderFeedId("folder-tech") });
    render(<SettingsPill />);
    await user.click(screen.getByTestId("settings-pill"));
    expect(openFolderSettings).toHaveBeenCalledWith("folder-tech");
  });

  it("on a smart filter view, clicking opens the smart-filter editor with that filter", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      selectedFeedId: toFilterFeedId("filter-recent"),
    });
    render(<SettingsPill />);
    await user.click(screen.getByTestId("settings-pill"));
    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "filter-recent" }),
    );
  });

  it("the label adapts to the context (Feed settings / Folder / Filter)", () => {
    useFeedStore.setState({ selectedFeedId: "f-tech" });
    const { rerender } = render(<SettingsPill />);
    expect(screen.getByText(/feed settings/i)).toBeInTheDocument();

    useFeedStore.setState({ selectedFeedId: toFolderFeedId("folder-tech") });
    rerender(<SettingsPill />);
    expect(screen.getByText(/folder settings/i)).toBeInTheDocument();

    useFeedStore.setState({
      selectedFeedId: toFilterFeedId("filter-recent"),
    });
    rerender(<SettingsPill />);
    expect(screen.getByText(/edit filter/i)).toBeInTheDocument();
  });

  it("hides on a folder view whose folder no longer exists (defensive)", () => {
    useFeedStore.setState({
      selectedFeedId: toFolderFeedId("folder-ghost"),
      folders: [],
    });
    const { container } = render(<SettingsPill />);
    expect(container.firstChild).toBeNull();
  });

  it("hides on a smart-filter view whose filter no longer exists (defensive)", () => {
    useFeedStore.setState({
      selectedFeedId: toFilterFeedId("filter-ghost"),
    });
    useSmartFilterStore.setState({ filters: [] });
    const { container } = render(<SettingsPill />);
    expect(container.firstChild).toBeNull();
  });
});
