import { describe, it, expect, beforeEach, vi } from "vitest";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import { useFeedStore } from "@/stores/feed-store.ts";

describe("feed-store folder open-state", () => {
  beforeEach(() => {
    useFeedStore.setState({ folderOpenState: {} });
  });

  it("setFolderOpen records true/false per folder", () => {
    useFeedStore.getState().setFolderOpen("f1", true);
    useFeedStore.getState().setFolderOpen("f2", false);
    expect(useFeedStore.getState().folderOpenState).toEqual({
      f1: true,
      f2: false,
    });
  });

  it("toggleFolderOpen flips an explicit value", () => {
    useFeedStore.setState({ folderOpenState: { f1: false } });
    useFeedStore.getState().toggleFolderOpen("f1");
    expect(useFeedStore.getState().folderOpenState.f1).toBe(true);
  });

  it("toggleFolderOpen treats undefined as open, so first toggle closes", () => {
    useFeedStore.getState().toggleFolderOpen("f1");
    expect(useFeedStore.getState().folderOpenState.f1).toBe(false);
  });
});

/**
 * Collapse state is device-local, like the list width: a phone and a
 * desktop reasonably keep different folders shut. Only the collapsed ids
 * are stored, so "never touched" keeps meaning "open".
 */
describe("feed-store folder open-state persistence", () => {
  const KEY = LOCAL_STORAGE.COLLAPSED_FOLDER_IDS;

  beforeEach(() => {
    localStorage.clear();
    useFeedStore.setState({ folderOpenState: {} });
  });

  async function reloadedStore() {
    vi.resetModules();
    const mod = await import("@/stores/feed-store.ts");
    return mod.useFeedStore;
  }

  it("a collapsed folder is still collapsed after a reload", async () => {
    useFeedStore.getState().setFolderOpen("news", false);

    const reloaded = await reloadedStore();

    expect(reloaded.getState().folderOpenState.news).toBe(false);
  });

  it("a folder collapsed with the toggle survives a reload too", async () => {
    useFeedStore.getState().toggleFolderOpen("news");

    const reloaded = await reloadedStore();

    expect(reloaded.getState().folderOpenState.news).toBe(false);
  });

  it("a reopened folder is open again after a reload", async () => {
    useFeedStore.getState().setFolderOpen("news", false);
    useFeedStore.getState().setFolderOpen("news", true);

    const reloaded = await reloadedStore();

    expect(reloaded.getState().folderOpenState.news ?? true).toBe(true);
  });

  it("an untouched folder stays open after a reload", async () => {
    useFeedStore.getState().setFolderOpen("news", false);

    const reloaded = await reloadedStore();

    expect(reloaded.getState().folderOpenState.sports ?? true).toBe(true);
  });

  it("garbage in storage reads as nothing collapsed", async () => {
    localStorage.setItem(KEY, '{"not":"an array"}');

    const reloaded = await reloadedStore();

    expect(reloaded.getState().folderOpenState).toEqual({});
  });

  it("deleting a folder forgets its collapsed state", async () => {
    useFeedStore.getState().setFolderOpen("news", false);
    useFeedStore.getState().setFolderOpen("sports", false);

    await useFeedStore.getState().deleteFolder("news");

    expect(useFeedStore.getState().folderOpenState).toEqual({ sports: false });
    expect(JSON.parse(localStorage.getItem(KEY) ?? "[]")).toEqual(["sports"]);
  });
});
