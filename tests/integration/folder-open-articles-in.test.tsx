/**
 * Folder settings → "Open articles in" persists through the real store and
 * the real encrypted db.ts (fake-indexeddb). Issue #342.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { FolderSettingsDialog } from "../../src/components/folders/folder-settings-dialog.tsx";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { open, close, deleteDatabase, getFolders } from "../../src/core/storage/db.ts";

vi.spyOn(useSyncStore.getState(), "scheduleSyncPush").mockImplementation(() => {});

async function openSettingsForNewFolder(name: string): Promise<string> {
  await useFeedStore.getState().createFolder(name);
  const id = useFeedStore.getState().folders.find((f) => f.name === name)!.id;
  useFeedStore.setState({ folderSettingsDialogId: id });
  render(
    <MemoryRouter>
      <FolderSettingsDialog />
    </MemoryRouter>,
  );
  return id;
}

describe("Folder settings: open articles in", () => {
  beforeEach(async () => {
    useFeedStore.setState({ feeds: [], folders: [], folderSettingsDialogId: null });
    const opened = await open("integration-test-passphrase");
    if (!opened.ok) throw new Error(`open failed: ${opened.error}`);
  });

  afterEach(async () => {
    close();
    await deleteDatabase();
  });

  it("defaults to the app setting", async () => {
    await openSettingsForNewFolder("World News");
    expect(screen.getByRole("combobox", { name: /open articles in/i })).toHaveValue("default");
  });

  it("choosing Full text stores it on the folder in the encrypted db", async () => {
    const id = await openSettingsForNewFolder("World News");

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /open articles in/i }),
      "full-text",
    );

    await vi.waitFor(async () => {
      const stored = await getFolders();
      expect(stored.ok && stored.value.find((f) => f.id === id)?.openArticlesIn).toBe("full-text");
    });
  });

  it("choosing App default clears the folder's own choice", async () => {
    const id = await openSettingsForNewFolder("World News");
    const select = screen.getByRole("combobox", { name: /open articles in/i });

    await userEvent.selectOptions(select, "feed");
    await userEvent.selectOptions(select, "default");

    await vi.waitFor(async () => {
      const stored = await getFolders();
      const folder = stored.ok ? stored.value.find((f) => f.id === id) : undefined;
      expect(folder).toBeDefined();
      expect(folder?.openArticlesIn).toBeUndefined();
    });
  });
});
