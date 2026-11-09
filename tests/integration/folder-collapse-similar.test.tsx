/**
 * Folder settings → "Collapse similar stories" persists through the real
 * store and the real encrypted db.ts (fake-indexeddb). Issue #343.
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

async function storedFolder(id: string) {
  const stored = await getFolders();
  return stored.ok ? stored.value.find((f) => f.id === id) : undefined;
}

describe("Folder settings: collapse similar stories", () => {
  beforeEach(async () => {
    useFeedStore.setState({ feeds: [], folders: [], folderSettingsDialogId: null });
    const opened = await open("integration-test-passphrase");
    if (!opened.ok) throw new Error(`open failed: ${opened.error}`);
  });

  afterEach(async () => {
    close();
    await deleteDatabase();
  });

  it("is off by default", async () => {
    await openSettingsForNewFolder("World News");
    expect(screen.getByRole("combobox", { name: /collapse similar stories/i })).toHaveValue("off");
  });

  it("choosing Normal stores it on the folder in the encrypted db", async () => {
    const id = await openSettingsForNewFolder("World News");

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /collapse similar stories/i }),
      "normal",
    );

    await vi.waitFor(async () => {
      expect((await storedFolder(id))?.collapseSimilar).toBe("normal");
    });
  });

  it("choosing Off clears the folder's setting", async () => {
    const id = await openSettingsForNewFolder("World News");
    const select = screen.getByRole("combobox", { name: /collapse similar stories/i });

    await userEvent.selectOptions(select, "strict");
    await userEvent.selectOptions(select, "off");

    await vi.waitFor(async () => {
      const folder = await storedFolder(id);
      expect(folder).toBeDefined();
      expect(folder?.collapseSimilar).toBeUndefined();
    });
  });
});
