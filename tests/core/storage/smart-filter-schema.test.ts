import { describe, it, expect } from "vitest";
import { createSmartFilter } from "../../../src/core/storage/schema.ts";
import type { ConditionGroup } from "@feedzero/core/types";

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

describe("createSmartFilter", () => {
  it("fills in id + timestamps + the required defaults", () => {
    const before = Date.now();
    const result = createSmartFilter({ name: "Recent unread", rule: emptyRule });
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Recent unread");
    expect(result.value.rule).toEqual(emptyRule);
    expect(result.value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.value.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.value.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.value.createdAt).toBeLessThanOrEqual(after);
  });

  it("rejects an empty name", () => {
    const result = createSmartFilter({ name: "", rule: emptyRule });
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only names so the sidebar never renders an invisible row", () => {
    const result = createSmartFilter({ name: "   ", rule: emptyRule });
    expect(result.ok).toBe(false);
  });

  it("passes optional fields through (icon, color, sortMode, limit)", () => {
    const result = createSmartFilter({
      name: "Tech AI",
      rule: emptyRule,
      icon: "Sparkles",
      color: "amber",
      sortMode: "unread-first",
      limit: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.icon).toBe("Sparkles");
    expect(result.value.color).toBe("amber");
    expect(result.value.sortMode).toBe("unread-first");
    expect(result.value.limit).toBe(50);
  });
});
