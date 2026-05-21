/**
 * feed-store gains open/close state for two new dialogs:
 *  - FeedSettingsDialog (controlled by feedSettingsDialogId)
 *  - FolderSettingsDialog (controlled by folderSettingsDialogId)
 *
 * Pattern mirrors the rulesEditorFeedId + openRulesEditor/closeRulesEditor
 * triplet that already lives on feed-store. Each id is null when the
 * dialog is closed; setting it opens the dialog against that target.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/core/storage/db.ts", () => ({
  getFeeds: vi.fn(async () => ({ ok: true, value: [] })),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  addFolder: vi.fn(),
  getFolders: vi.fn(async () => ({ ok: true, value: [] })),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("../../src/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn(),
  prefetchFeedArticles: vi.fn(),
  selectFrequentFeeds: vi.fn(() => []),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import { useFeedStore } from "../../src/stores/feed-store.ts";

describe("feed-store dialog open/close state", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feedSettingsDialogId: null,
      folderSettingsDialogId: null,
    });
  });

  describe("feed settings dialog", () => {
    it("starts closed", () => {
      expect(useFeedStore.getState().feedSettingsDialogId).toBeNull();
    });

    it("openFeedSettings(id) sets the dialog id", () => {
      useFeedStore.getState().openFeedSettings("f-tech");
      expect(useFeedStore.getState().feedSettingsDialogId).toBe("f-tech");
    });

    it("closeFeedSettings clears the dialog id", () => {
      useFeedStore.getState().openFeedSettings("f-tech");
      useFeedStore.getState().closeFeedSettings();
      expect(useFeedStore.getState().feedSettingsDialogId).toBeNull();
    });

    it("opening a different feed swaps the target without an intermediate close", () => {
      useFeedStore.getState().openFeedSettings("f-tech");
      useFeedStore.getState().openFeedSettings("f-news");
      expect(useFeedStore.getState().feedSettingsDialogId).toBe("f-news");
    });
  });

  describe("folder settings dialog", () => {
    it("starts closed", () => {
      expect(useFeedStore.getState().folderSettingsDialogId).toBeNull();
    });

    it("openFolderSettings(id) sets the dialog id", () => {
      useFeedStore.getState().openFolderSettings("folder-crypto");
      expect(useFeedStore.getState().folderSettingsDialogId).toBe(
        "folder-crypto",
      );
    });

    it("closeFolderSettings clears the dialog id", () => {
      useFeedStore.getState().openFolderSettings("folder-crypto");
      useFeedStore.getState().closeFolderSettings();
      expect(useFeedStore.getState().folderSettingsDialogId).toBeNull();
    });
  });

  it("the two dialogs are independent — opening one does not close the other", () => {
    useFeedStore.getState().openFeedSettings("f-tech");
    useFeedStore.getState().openFolderSettings("folder-crypto");
    expect(useFeedStore.getState().feedSettingsDialogId).toBe("f-tech");
    expect(useFeedStore.getState().folderSettingsDialogId).toBe(
      "folder-crypto",
    );
  });
});
