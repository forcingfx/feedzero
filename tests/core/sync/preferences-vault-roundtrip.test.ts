import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
  putPreferences,
  getPreferences,
} from "../../../src/core/storage/db.ts";
import {
  exportVault,
  importVault,
  mergeVaults,
} from "../../../src/core/sync/sync-service.ts";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import type { UserPreferences } from "@feedzero/core/types";
import type { VaultData } from "../../../src/core/sync/types.ts";

const localPrefs: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  feedSortMode: "custom",
  feedCustomOrder: ["local"],
};
const cloudPrefs: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  feedSortMode: "count",
  feedCustomOrder: ["cloud"],
};

function vault(over: Partial<VaultData>): VaultData {
  return { version: 3, exportedAt: 1, feeds: [], articles: [], ...over };
}

describe("preferences in the sync vault", () => {
  describe("export / import round-trip", () => {
    beforeEach(async () => {
      await deleteDatabase();
      expect((await open("p1")).ok).toBe(true);
    });
    afterEach(() => close());

    it("exportVault includes the stored preferences + timestamp", async () => {
      await putPreferences(localPrefs);
      const result = await exportVault();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.preferences).toEqual(localPrefs);
      expect(result.value.preferencesUpdatedAt).toBeTypeOf("number");
    });

    it("exportVault omits preferences (undefined) when none are stored", async () => {
      const result = await exportVault();
      if (!result.ok) throw new Error("exportVault failed");
      expect(result.value.preferences).toBeUndefined();
      expect(result.value.preferencesUpdatedAt).toBeUndefined();
    });

    it("importVault writes preferences through to storage", async () => {
      const result = await importVault(
        vault({ preferences: cloudPrefs, preferencesUpdatedAt: 999 }),
      );
      expect(result.ok).toBe(true);
      const got = await getPreferences();
      if (!got.ok) throw new Error("getPreferences failed");
      expect(got.value).toEqual(cloudPrefs);
    });
  });

  describe("mergeVaults preferences (timestamp last-write-wins)", () => {
    it("picks the side with the newer preferencesUpdatedAt", () => {
      const local = vault({ preferences: localPrefs, preferencesUpdatedAt: 100 });
      const cloud = vault({ preferences: cloudPrefs, preferencesUpdatedAt: 200 });
      const merged = mergeVaults(local, cloud);
      if (!merged.ok) throw new Error("mergeVaults failed");
      expect(merged.value.preferences).toEqual(cloudPrefs);
      expect(merged.value.preferencesUpdatedAt).toBe(200);
    });

    it("keeps local preferences when local is newer", () => {
      const local = vault({ preferences: localPrefs, preferencesUpdatedAt: 300 });
      const cloud = vault({ preferences: cloudPrefs, preferencesUpdatedAt: 200 });
      const merged = mergeVaults(local, cloud);
      if (!merged.ok) throw new Error("mergeVaults failed");
      expect(merged.value.preferences).toEqual(localPrefs);
      expect(merged.value.preferencesUpdatedAt).toBe(300);
    });

    it("favors local on a timestamp tie", () => {
      const local = vault({ preferences: localPrefs, preferencesUpdatedAt: 200 });
      const cloud = vault({ preferences: cloudPrefs, preferencesUpdatedAt: 200 });
      const merged = mergeVaults(local, cloud);
      if (!merged.ok) throw new Error("mergeVaults failed");
      expect(merged.value.preferences).toEqual(localPrefs);
    });

    it("preserves undefined when neither side has preferences", () => {
      const merged = mergeVaults(vault({}), vault({}));
      if (!merged.ok) throw new Error("mergeVaults failed");
      expect(merged.value.preferences).toBeUndefined();
      expect(merged.value.preferencesUpdatedAt).toBeUndefined();
    });

    it("takes the only defined side regardless of timestamp absence", () => {
      const local = vault({});
      const cloud = vault({ preferences: cloudPrefs, preferencesUpdatedAt: 5 });
      const merged = mergeVaults(local, cloud);
      if (!merged.ok) throw new Error("mergeVaults failed");
      expect(merged.value.preferences).toEqual(cloudPrefs);
      expect(merged.value.preferencesUpdatedAt).toBe(5);
    });
  });
});
