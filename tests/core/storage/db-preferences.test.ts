import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
  getPreferences,
  putPreferences,
  getPreferencesUpdatedAt,
  exportAll,
  importAll,
} from "../../../src/core/storage/db.ts";
import { DEFAULT_PREFERENCES } from "../../../src/types/index.ts";
import type { UserPreferences } from "../../../src/types/index.ts";

const customPrefs: UserPreferences = {
  feedSortMode: "custom",
  feedCustomOrder: ["b", "a", "c"],
  folderCustomOrder: ["f2", "f1"],
  articleSortMode: "oldest",
  groupArticleFloods: false,
};

describe("db preferences accessors", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("p1");
    expect(opened.ok).toBe(true);
  });
  afterEach(() => close());

  it("getPreferences returns ok(null) when no row exists", async () => {
    const result = await getPreferences();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("putPreferences then getPreferences round-trips the record", async () => {
    const put = await putPreferences(customPrefs);
    expect(put.ok).toBe(true);

    const got = await getPreferences();
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toEqual(customPrefs);
  });

  it("putPreferences stamps a meta timestamp", async () => {
    const before = Date.now();
    await putPreferences(customPrefs);
    const ts = await getPreferencesUpdatedAt();
    expect(ts.ok).toBe(true);
    if (!ts.ok) return;
    expect(ts.value).not.toBeNull();
    expect(ts.value!).toBeGreaterThanOrEqual(before);
  });

  it("getPreferencesUpdatedAt returns ok(null) before any write", async () => {
    const ts = await getPreferencesUpdatedAt();
    expect(ts.ok).toBe(true);
    if (!ts.ok) return;
    expect(ts.value).toBeNull();
  });

  it("exportAll surfaces preferences + preferencesUpdatedAt", async () => {
    await putPreferences(customPrefs);
    const result = await exportAll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences).toEqual(customPrefs);
    expect(result.value.preferencesUpdatedAt).not.toBeNull();
  });

  it("exportAll returns null preferences when none stored", async () => {
    const result = await exportAll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preferences).toBeNull();
    expect(result.value.preferencesUpdatedAt).toBeNull();
  });

  it("importAll with preferences replaces the row and sets the timestamp", async () => {
    await putPreferences(DEFAULT_PREFERENCES);
    const result = await importAll({
      feeds: [],
      articles: [],
      preferences: customPrefs,
      preferencesUpdatedAt: 12345,
    });
    expect(result.ok).toBe(true);

    const got = await getPreferences();
    if (!got.ok) throw new Error("getPreferences failed");
    expect(got.value).toEqual(customPrefs);

    const ts = await getPreferencesUpdatedAt();
    if (!ts.ok) throw new Error("getPreferencesUpdatedAt failed");
    expect(ts.value).toBe(12345);
  });

  it("importAll leaves the local preferences row untouched when the key is omitted (back-compat)", async () => {
    await putPreferences(customPrefs);
    const result = await importAll({ feeds: [], articles: [] });
    expect(result.ok).toBe(true);

    const got = await getPreferences();
    if (!got.ok) throw new Error("getPreferences failed");
    expect(got.value).toEqual(customPrefs);
  });
});
