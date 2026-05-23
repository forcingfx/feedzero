/**
 * FolderSettingsDialog — opened by the floating cog when the user is
 * inside a folder view. Replaces the folder's sidebar three-dot
 * dropdown (rename + color + delete).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { FolderSettingsDialog } from "@/components/folders/folder-settings-dialog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import type { Folder } from "@feedzero/core/types";

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

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-tech",
    name: "Tech",
    createdAt: 0,
    ...overrides,
  };
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <FolderSettingsDialog />
    </MemoryRouter>,
  );
}

describe("FolderSettingsDialog", () => {
  let renameFolder: ReturnType<typeof vi.fn>;
  let updateFolderColor: ReturnType<typeof vi.fn>;
  let deleteFolder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    renameFolder = vi.fn().mockResolvedValue(undefined);
    updateFolderColor = vi.fn().mockResolvedValue(undefined);
    deleteFolder = vi.fn().mockResolvedValue(undefined);

    useFeedStore.setState({
      folders: [folder()],
      folderSettingsDialogId: null,
      renameFolder,
      updateFolderColor,
      deleteFolder,
    });
  });

  it("does not render when folderSettingsDialogId is null", () => {
    renderDialog();
    expect(screen.queryByTestId("folder-settings-dialog")).toBeNull();
  });

  it("opens with the target folder's name in the header", () => {
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();
    expect(screen.getByTestId("folder-settings-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Tech/)).toBeInTheDocument();
  });

  it("Name field saves via renameFolder when Save is clicked", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();

    const input = screen.getByTestId("folder-settings-name-input");
    await user.clear(input);
    await user.type(input, "Engineering");
    await user.click(screen.getByTestId("folder-settings-name-save"));

    expect(renameFolder).toHaveBeenCalledWith("folder-tech", "Engineering");
  });

  it("color picker renders one swatch per folder color", () => {
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();
    const picker = screen.getByTestId("folder-color-picker");
    const swatches = picker.querySelectorAll("button");
    expect(swatches.length).toBeGreaterThanOrEqual(8);
  });

  it("selecting a color writes through updateFolderColor", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();

    const violet = screen.getByLabelText(/Set folder color #7c3aed/i);
    await user.click(violet);

    expect(updateFolderColor).toHaveBeenCalledWith(
      "folder-tech",
      "#7c3aed",
    );
  });

  it("clicking the current color clears it (toggle off)", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      folders: [folder({ color: "#7c3aed" })],
      folderSettingsDialogId: "folder-tech",
    });
    renderDialog();

    const violet = screen.getByLabelText(/Set folder color #7c3aed/i);
    await user.click(violet);

    expect(updateFolderColor).toHaveBeenCalledWith("folder-tech", undefined);
  });

  it("Delete button shows a confirmation, then calls deleteFolder when confirmed", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();

    await user.click(screen.getByTestId("folder-settings-delete"));
    const confirm = await screen.findByTestId(
      "folder-settings-delete-confirm",
    );
    await user.click(confirm);

    expect(deleteFolder).toHaveBeenCalledWith("folder-tech");
  });

  it("Delete confirmation can be cancelled", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ folderSettingsDialogId: "folder-tech" });
    renderDialog();

    await user.click(screen.getByTestId("folder-settings-delete"));
    const cancel = await screen.findByTestId(
      "folder-settings-delete-cancel",
    );
    await user.click(cancel);

    expect(deleteFolder).not.toHaveBeenCalled();
  });
});
