import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ok } from "@feedzero/core/utils/result";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";

// db boundary — preferences-store reads/writes the encrypted row through it.
const getPreferencesMock = vi.fn();
const putPreferencesMock = vi.fn();
vi.mock("../../src/core/storage/db.ts", () => ({
  getPreferences: (...a: unknown[]) => getPreferencesMock(...a),
  putPreferences: (...a: unknown[]) => putPreferencesMock(...a),
}));

import { usePreferencesStore } from "../../src/stores/preferences-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useFeedStore } from "../../src/stores/feed-store.ts";

const LEGACY = {
  sort: "feedzero:feed-sort-mode",
  feedOrder: "feedzero:feed-custom-order",
  folderOrder: "feedzero:folder-custom-order",
  articleSort: "feedzero:article-sort-mode",
  floods: "feedzero:group-article-floods",
};

describe("preferences-store", () => {
  beforeEach(() => {
    localStorage.clear();
    getPreferencesMock.mockReset().mockResolvedValue(ok(null));
    putPreferencesMock.mockReset().mockResolvedValue(ok(true));
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      hydrated: false,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  describe("update", () => {
    it("merges the patch, persists via putPreferences, and schedules a sync push", async () => {
      const scheduleSpy = vi
        .spyOn(useSyncStore.getState(), "scheduleSyncPush")
        .mockImplementation(() => {});

      await usePreferencesStore.getState().update({ feedSortMode: "custom" });

      expect(usePreferencesStore.getState().preferences.feedSortMode).toBe(
        "custom",
      );
      expect(putPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ feedSortMode: "custom" }),
      );
      expect(scheduleSpy).toHaveBeenCalled();
    });
  });

  describe("hydrate", () => {
    it("loads an existing db row and propagates it into the feed store", async () => {
      getPreferencesMock.mockResolvedValue(
        ok({
          ...DEFAULT_PREFERENCES,
          feedSortMode: "count",
          feedCustomOrder: ["b", "a"],
        }),
      );

      await usePreferencesStore.getState().hydrate();

      expect(usePreferencesStore.getState().hydrated).toBe(true);
      expect(usePreferencesStore.getState().preferences.feedSortMode).toBe(
        "count",
      );
      expect(useFeedStore.getState().feedSortMode).toBe("count");
      expect(useFeedStore.getState().feedCustomOrder).toEqual(["b", "a"]);
    });

    it("migrates legacy localStorage keys into the db row when none exists, then clears them", async () => {
      localStorage.setItem(LEGACY.sort, "custom");
      localStorage.setItem(LEGACY.feedOrder, JSON.stringify(["f2", "f1"]));
      localStorage.setItem(LEGACY.articleSort, "oldest");
      localStorage.setItem(LEGACY.floods, "false");
      getPreferencesMock.mockResolvedValue(ok(null));

      await usePreferencesStore.getState().hydrate();

      expect(putPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feedSortMode: "custom",
          feedCustomOrder: ["f2", "f1"],
          articleSortMode: "oldest",
          groupArticleFloods: false,
        }),
      );
      // Legacy keys removed after migration.
      expect(localStorage.getItem(LEGACY.sort)).toBeNull();
      expect(localStorage.getItem(LEGACY.feedOrder)).toBeNull();
      expect(localStorage.getItem(LEGACY.articleSort)).toBeNull();
      expect(localStorage.getItem(LEGACY.floods)).toBeNull();
    });

    it("is idempotent — a second call does not re-read the db", async () => {
      getPreferencesMock.mockResolvedValue(ok({ ...DEFAULT_PREFERENCES }));
      await usePreferencesStore.getState().hydrate();
      getPreferencesMock.mockClear();
      await usePreferencesStore.getState().hydrate();
      expect(getPreferencesMock).not.toHaveBeenCalled();
    });
  });

  describe("reload", () => {
    it("re-reads the db row and propagates it even after hydrate ran", async () => {
      getPreferencesMock.mockResolvedValue(ok({ ...DEFAULT_PREFERENCES }));
      await usePreferencesStore.getState().hydrate();

      getPreferencesMock.mockResolvedValue(
        ok({ ...DEFAULT_PREFERENCES, feedSortMode: "count" }),
      );
      await usePreferencesStore.getState().reload();

      expect(usePreferencesStore.getState().preferences.feedSortMode).toBe(
        "count",
      );
      expect(useFeedStore.getState().feedSortMode).toBe("count");
    });
  });
});
