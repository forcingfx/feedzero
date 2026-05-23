import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
  addSmartFilter,
  getSmartFilters,
  updateSmartFilter,
  removeSmartFilter,
} from "../../../src/core/storage/db.ts";
import { createSmartFilter } from "../../../src/core/storage/schema.ts";
import type { SmartFilter, ConditionGroup } from "@feedzero/core/types";

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

function buildFilter(overrides: Partial<SmartFilter> = {}): SmartFilter {
  const created = createSmartFilter({ name: "Test", rule: emptyRule });
  if (!created.ok) throw new Error("createSmartFilter failed in test setup");
  return { ...created.value, ...overrides };
}

describe("smartFilters Dexie table (encrypted CRUD)", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);
  });

  afterEach(() => {
    close();
  });

  it("addSmartFilter persists and getSmartFilters returns the decrypted row", async () => {
    const f = buildFilter({ name: "Recent AI" });

    const added = await addSmartFilter(f);
    expect(added.ok).toBe(true);

    const fetched = await getSmartFilters();
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toHaveLength(1);
    expect(fetched.value[0].name).toBe("Recent AI");
    expect(fetched.value[0].id).toBe(f.id);
  });

  it("preserves the full nested rule across encrypt/decrypt", async () => {
    const f = buildFilter({
      name: "Nested",
      rule: {
        kind: "group",
        match: "all",
        children: [
          { kind: "title", op: "contains", value: "AI" },
          {
            kind: "group",
            match: "any",
            not: true,
            children: [
              { kind: "read", op: "is", value: true },
              { kind: "starred", op: "is", value: false },
            ],
          },
        ],
      },
    });

    await addSmartFilter(f);
    const fetched = await getSmartFilters();
    if (!fetched.ok) throw new Error("getSmartFilters failed");

    expect(fetched.value[0].rule).toEqual(f.rule);
  });

  it("updateSmartFilter replaces the existing row", async () => {
    const f = buildFilter({ name: "Original" });
    await addSmartFilter(f);

    await updateSmartFilter({ ...f, name: "Renamed", updatedAt: f.updatedAt + 1 });

    const fetched = await getSmartFilters();
    if (!fetched.ok) throw new Error("getSmartFilters failed");
    expect(fetched.value).toHaveLength(1);
    expect(fetched.value[0].name).toBe("Renamed");
  });

  it("removeSmartFilter deletes the row", async () => {
    const f = buildFilter();
    await addSmartFilter(f);

    const removed = await removeSmartFilter(f.id);
    expect(removed.ok).toBe(true);

    const fetched = await getSmartFilters();
    if (!fetched.ok) throw new Error("getSmartFilters failed");
    expect(fetched.value).toHaveLength(0);
  });

  it("returns an empty array when no filters exist (does not error)", async () => {
    const fetched = await getSmartFilters();
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toEqual([]);
  });
});
