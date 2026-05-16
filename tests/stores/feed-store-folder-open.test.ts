import { describe, it, expect, beforeEach } from "vitest";
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
