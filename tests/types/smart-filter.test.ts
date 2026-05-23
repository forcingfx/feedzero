import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  SmartFilter,
  ConditionGroup,
  Condition,
} from "@feedzero/core/types";

/**
 * Type-shape tripwires for the smart-filter data model. The runtime
 * tests for the evaluator + storage live elsewhere; this file just
 * documents the contract every other slice depends on.
 */
describe("SmartFilter / ConditionGroup / Condition types", () => {
  it("SmartFilter accepts the minimum required shape", () => {
    const minimal: SmartFilter = {
      id: "f1",
      name: "Recent unread",
      rule: { kind: "group", match: "all", children: [] },
      createdAt: 1,
      updatedAt: 1,
    };
    expect(minimal.name).toBe("Recent unread");
  });

  it("SmartFilter accepts the optional fields (icon, color, sortMode, limit)", () => {
    const full: SmartFilter = {
      id: "f1",
      name: "Recent unread",
      icon: "Filter",
      color: "amber",
      sortMode: "newest",
      limit: 100,
      rule: { kind: "group", match: "all", children: [] },
      createdAt: 1,
      updatedAt: 1,
    };
    expect(full.limit).toBe(100);
  });

  it("ConditionGroup allows nested groups and child conditions", () => {
    const nested: ConditionGroup = {
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
    };
    expect(nested.children).toHaveLength(2);
  });

  it("Condition discriminated union covers every supported field", () => {
    // Compile-time enumeration — TypeScript narrows by .kind so adding a
    // new field to the union without updating the evaluator will fail to
    // type-check at the evaluator's switch site.
    const cases: Condition[] = [
      { kind: "title", op: "contains", value: "x" },
      { kind: "title", op: "not-contains", value: "x" },
      { kind: "title", op: "equals", value: "x" },
      { kind: "title", op: "matches", value: "^x$" },
      { kind: "author", op: "contains", value: "x" },
      { kind: "author", op: "not-contains", value: "x" },
      { kind: "author", op: "equals", value: "x" },
      { kind: "content", op: "contains", value: "x" },
      { kind: "content", op: "not-contains", value: "x" },
      { kind: "content", op: "matches", value: "^x" },
      { kind: "feed", op: "in", value: ["a", "b"] },
      { kind: "feed", op: "not-in", value: ["a"] },
      { kind: "folder", op: "in", value: ["f1"] },
      { kind: "folder", op: "not-in", value: ["f1"] },
      { kind: "publishedAt", op: "in-last-days", value: 7 },
      { kind: "publishedAt", op: "in-last-hours", value: 24 },
      { kind: "publishedAt", op: "before", value: 1_700_000_000_000 },
      { kind: "publishedAt", op: "after", value: 1_700_000_000_000 },
      { kind: "publishedAt", op: "between", value: [1, 2] },
      { kind: "read", op: "is", value: true },
      { kind: "starred", op: "is", value: false },
      { kind: "extracted", op: "is", value: true },
      { kind: "filterRef", op: "matches", value: "other-filter-id" },
    ];
    expect(cases.length).toBeGreaterThan(0);
    expectTypeOf(cases[0]).toMatchTypeOf<Condition>();
  });
});
