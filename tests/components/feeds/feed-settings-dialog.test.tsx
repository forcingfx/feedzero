/**
 * FeedSettingsDialog — the unified per-feed settings surface, opened
 * by the floating cog pill above the article list. Replaces the
 * scattered three-dot dropdown entries on every sidebar feed row.
 *
 * Coverage focus: dialog opens against the right feed; each section
 * writes through to the right store action; destructive actions
 * confirm.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { FeedSettingsDialog } from "@/components/feeds/feed-settings-dialog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import type { Feed, Folder } from "@/types/index.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  addFolder: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("@/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn(),
  prefetchFeedArticles: vi.fn(),
  selectFrequentFeeds: vi.fn(() => []),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f-tech",
    url: "https://example.com/feed.xml",
    title: "Tech Crunchies",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function folder(id: string, name: string): Folder {
  return { id, name, createdAt: 0 };
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <FeedSettingsDialog />
    </MemoryRouter>,
  );
}

describe("FeedSettingsDialog", () => {
  let renameFeed: ReturnType<typeof vi.fn>;
  let setFeedPreferFullText: ReturnType<typeof vi.fn>;
  let setFeedPrefetchEnabled: ReturnType<typeof vi.fn>;
  let moveFeedToFolder: ReturnType<typeof vi.fn>;
  let refreshSingleFeed: ReturnType<typeof vi.fn>;
  let reloadSingleFeed: ReturnType<typeof vi.fn>;
  let removeFeed: ReturnType<typeof vi.fn>;
  let openRulesEditor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    renameFeed = vi.fn().mockResolvedValue(undefined);
    setFeedPreferFullText = vi.fn().mockResolvedValue(undefined);
    setFeedPrefetchEnabled = vi.fn().mockResolvedValue(undefined);
    moveFeedToFolder = vi.fn().mockResolvedValue(undefined);
    refreshSingleFeed = vi.fn().mockResolvedValue(undefined);
    reloadSingleFeed = vi.fn().mockResolvedValue(undefined);
    removeFeed = vi.fn().mockResolvedValue(undefined);
    openRulesEditor = vi.fn();

    useFeedStore.setState({
      feeds: [feed()],
      folders: [],
      feedSettingsDialogId: null,
      renameFeed,
      setFeedPreferFullText,
      setFeedPrefetchEnabled,
      moveFeedToFolder,
      refreshSingleFeed,
      reloadSingleFeed,
      removeFeed,
      openRulesEditor,
    });
  });

  it("does not render when feedSettingsDialogId is null", () => {
    renderDialog();
    expect(screen.queryByTestId("feed-settings-dialog")).toBeNull();
  });

  it("opens with the target feed's title in the header", () => {
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();
    expect(screen.getByTestId("feed-settings-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Tech Crunchies/)).toBeInTheDocument();
  });

  it("does not autofocus the Name field on open", () => {
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();
    const input = screen.getByTestId("feed-settings-name-input");
    expect(input).not.toHaveFocus();
  });

  it("Name field saves via renameFeed when Save is clicked", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();

    const input = screen.getByTestId("feed-settings-name-input");
    await user.clear(input);
    await user.type(input, "Tech (renamed)");
    await user.click(screen.getByTestId("feed-settings-name-save"));

    expect(renameFeed).toHaveBeenCalledWith("f-tech", "Tech (renamed)");
  });

  it("Prefer full text switch reflects feed state and toggles via setFeedPreferFullText", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed({ preferFullText: true })],
      feedSettingsDialogId: "f-tech",
    });
    renderDialog();

    const switchEl = screen.getByTestId("feed-settings-prefer-full-text");
    expect(switchEl).toHaveAttribute("data-state", "checked");

    await user.click(switchEl);
    expect(setFeedPreferFullText).toHaveBeenCalledWith("f-tech", false);
  });

  it("Prefetch full text switch reflects feed state and toggles via setFeedPrefetchEnabled", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed({ prefetchEnabled: false })],
      feedSettingsDialogId: "f-tech",
    });
    renderDialog();

    const switchEl = screen.getByTestId("feed-settings-prefetch");
    expect(switchEl).toHaveAttribute("data-state", "unchecked");

    await user.click(switchEl);
    expect(setFeedPrefetchEnabled).toHaveBeenCalledWith("f-tech", true);
  });

  it("Folder picker calls moveFeedToFolder with the selected folder id", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed({ folderId: undefined })],
      folders: [folder("folder-tech", "Tech"), folder("folder-news", "News")],
      feedSettingsDialogId: "f-tech",
    });
    renderDialog();

    const select = screen.getByTestId("feed-settings-folder");
    await user.selectOptions(select, "folder-tech");
    expect(moveFeedToFolder).toHaveBeenCalledWith("f-tech", "folder-tech");
  });

  it("Folder picker can move to Unfiled (null)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed({ folderId: "folder-tech" })],
      folders: [folder("folder-tech", "Tech")],
      feedSettingsDialogId: "f-tech",
    });
    renderDialog();

    const select = screen.getByTestId("feed-settings-folder");
    await user.selectOptions(select, "");
    expect(moveFeedToFolder).toHaveBeenCalledWith("f-tech", null);
  });

  it("Manage rules button calls openRulesEditor with the feed id", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();

    await user.click(screen.getByTestId("feed-settings-manage-rules"));
    expect(openRulesEditor).toHaveBeenCalledWith("f-tech");
  });

  it("Refresh button calls refreshSingleFeed", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();
    await user.click(screen.getByTestId("feed-settings-refresh"));
    expect(refreshSingleFeed).toHaveBeenCalledWith("f-tech");
  });

  it("Clear cached articles button calls reloadSingleFeed", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();
    await user.click(screen.getByTestId("feed-settings-clear-cache"));
    expect(reloadSingleFeed).toHaveBeenCalledWith("f-tech");
  });

  it("Delete button shows a confirmation, then calls removeFeed when confirmed", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();

    await user.click(screen.getByTestId("feed-settings-delete"));
    // AlertDialog renders the confirm in a portal
    const confirm = await screen.findByTestId("feed-settings-delete-confirm");
    await user.click(confirm);

    expect(removeFeed).toHaveBeenCalledWith("f-tech");
  });

  it("Delete confirmation can be cancelled (removeFeed not called)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feedSettingsDialogId: "f-tech" });
    renderDialog();

    await user.click(screen.getByTestId("feed-settings-delete"));
    const cancel = await screen.findByTestId("feed-settings-delete-cancel");
    await user.click(cancel);

    expect(removeFeed).not.toHaveBeenCalled();
  });
});
