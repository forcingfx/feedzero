import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
  addFolder,
  getFolders,
  addSmartFilter,
  getSmartFilters,
  importAll,
  exportAll,
} from "../../../src/core/storage/db.ts";
import { createSmartFilter } from "../../../src/core/storage/schema.ts";
import {
  exportVault,
  importVault,
  mergeVaults,
} from "../../../src/core/sync/sync-service.ts";
import type {
  Folder,
  SmartFilter,
  ConditionGroup,
} from "@feedzero/core/types";
import type { VaultData } from "../../../src/core/sync/types.ts";

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

function buildFolder(id: string, name: string): Folder {
  return { id, name, createdAt: Date.now() };
}

function buildFilter(name: string): SmartFilter {
  const created = createSmartFilter({ name, rule: emptyRule });
  if (!created.ok) throw new Error("createSmartFilter failed in test setup");
  return created.value;
}

describe("exportAll + importAll cover folders and smartFilters", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("p1");
    expect(opened.ok).toBe(true);
  });
  afterEach(() => close());

  it("exportAll returns all four entity collections", async () => {
    await addFolder(buildFolder("fo1", "Tech"));
    await addSmartFilter(buildFilter("Recent AI"));

    const result = await exportAll();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.folders).toHaveLength(1);
    expect(result.value.folders[0].name).toBe("Tech");
    expect(result.value.smartFilters).toHaveLength(1);
    expect(result.value.smartFilters[0].name).toBe("Recent AI");
  });

  it("importAll with folders + smartFilters replaces the existing rows", async () => {
    await addFolder(buildFolder("old-folder", "Old"));
    await addSmartFilter(buildFilter("Old filter"));

    const nextFolders = [buildFolder("new-folder", "New")];
    const nextFilters = [buildFilter("New filter")];
    const result = await importAll({
      feeds: [],
      articles: [],
      folders: nextFolders,
      smartFilters: nextFilters,
    });
    expect(result.ok).toBe(true);

    const fetchedFolders = await getFolders();
    if (!fetchedFolders.ok) throw new Error("getFolders failed");
    expect(fetchedFolders.value.map((f) => f.name)).toEqual(["New"]);

    const fetchedFilters = await getSmartFilters();
    if (!fetchedFilters.ok) throw new Error("getSmartFilters failed");
    expect(fetchedFilters.value.map((f) => f.name)).toEqual(["New filter"]);
  });

  it("importAll leaves local folders / smartFilters alone when the vault omits those keys (back-compat with v1 vaults)", async () => {
    // Critical invariant — a pre-v2 client pushing its vault MUST NOT
    // wipe a v2 client's folders. The unwrapper treats `undefined` as
    // "no opinion", not "empty".
    await addFolder(buildFolder("local-folder", "Keep me"));
    await addSmartFilter(buildFilter("Keep filter"));

    const result = await importAll({
      feeds: [],
      articles: [],
      // folders + smartFilters intentionally omitted
    });
    expect(result.ok).toBe(true);

    const fetchedFolders = await getFolders();
    if (!fetchedFolders.ok) throw new Error("getFolders failed");
    expect(fetchedFolders.value.map((f) => f.name)).toEqual(["Keep me"]);

    const fetchedFilters = await getSmartFilters();
    if (!fetchedFilters.ok) throw new Error("getSmartFilters failed");
    expect(fetchedFilters.value.map((f) => f.name)).toEqual(["Keep filter"]);
  });

  it("importAll with empty arrays clears the respective tables (distinct from undefined)", async () => {
    await addFolder(buildFolder("a", "A"));
    await addSmartFilter(buildFilter("B"));

    await importAll({
      feeds: [],
      articles: [],
      folders: [],
      smartFilters: [],
    });

    const folders = await getFolders();
    const filters = await getSmartFilters();
    if (!folders.ok || !filters.ok) throw new Error("fetch failed");
    expect(folders.value).toEqual([]);
    expect(filters.value).toEqual([]);
  });

  it("exportVault includes folders + smartFilters", async () => {
    await addFolder(buildFolder("fo1", "T"));
    await addSmartFilter(buildFilter("F"));

    const vault = await exportVault();
    expect(vault.ok).toBe(true);
    if (!vault.ok) return;
    expect(vault.value.folders).toHaveLength(1);
    expect(vault.value.smartFilters).toHaveLength(1);
  });

  it("importVault writes folders + smartFilters through to storage", async () => {
    const vault: VaultData = {
      version: 2,
      exportedAt: Date.now(),
      feeds: [],
      articles: [],
      folders: [buildFolder("fo1", "Imported")],
      smartFilters: [buildFilter("Imported filter")],
    };

    const result = await importVault(vault);
    expect(result.ok).toBe(true);

    const folders = await getFolders();
    const filters = await getSmartFilters();
    if (!folders.ok || !filters.ok) throw new Error("fetch failed");
    expect(folders.value.map((f) => f.name)).toEqual(["Imported"]);
    expect(filters.value.map((f) => f.name)).toEqual(["Imported filter"]);
  });
});

describe("mergeVaults — folders + smartFilters", () => {
  it("merges folders by id; local wins on collisions", () => {
    const local: VaultData = {
      version: 2,
      exportedAt: 1,
      feeds: [],
      articles: [],
      folders: [
        { id: "shared", name: "Local name", createdAt: 1 },
        { id: "local-only", name: "Local only", createdAt: 1 },
      ],
      smartFilters: [],
    };
    const cloud: VaultData = {
      version: 2,
      exportedAt: 2,
      feeds: [],
      articles: [],
      folders: [
        { id: "shared", name: "Cloud name", createdAt: 2 },
        { id: "cloud-only", name: "Cloud only", createdAt: 2 },
      ],
      smartFilters: [],
    };

    const merged = mergeVaults(local, cloud);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    const names = merged.value.folders!.map((f) => f.name).sort();
    expect(names).toEqual(["Cloud only", "Local name", "Local only"]);
  });

  it("merges smartFilters by id; local wins on collisions", () => {
    const local: VaultData = {
      version: 2,
      exportedAt: 1,
      feeds: [],
      articles: [],
      folders: [],
      smartFilters: [
        { ...buildFilter("Local A"), id: "shared" },
        { ...buildFilter("Local-only B"), id: "local-only" },
      ],
    };
    const cloud: VaultData = {
      version: 2,
      exportedAt: 2,
      feeds: [],
      articles: [],
      folders: [],
      smartFilters: [
        { ...buildFilter("Cloud A"), id: "shared" },
        { ...buildFilter("Cloud-only C"), id: "cloud-only" },
      ],
    };

    const merged = mergeVaults(local, cloud);
    if (!merged.ok) throw new Error("mergeVaults failed");

    const names = merged.value.smartFilters!.map((f) => f.name).sort();
    expect(names).toEqual(["Cloud-only C", "Local A", "Local-only B"]);
  });

  it("merges a v1 cloud vault (no folders/smartFilters) without losing local rows", () => {
    const local: VaultData = {
      version: 2,
      exportedAt: 1,
      feeds: [],
      articles: [],
      folders: [{ id: "fo1", name: "Keep", createdAt: 1 }],
      smartFilters: [buildFilter("Keep filter")],
    };
    const cloud: VaultData = {
      version: 1,
      exportedAt: 2,
      feeds: [],
      articles: [],
      // No folders, no smartFilters keys at all (legacy shape)
    };

    const merged = mergeVaults(local, cloud);
    if (!merged.ok) throw new Error("mergeVaults failed");
    expect(merged.value.folders).toHaveLength(1);
    expect(merged.value.smartFilters).toHaveLength(1);
  });
});
