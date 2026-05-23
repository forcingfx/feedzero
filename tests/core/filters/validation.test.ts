import { describe, it, expect } from "vitest";
import {
  validateCondition,
  validateGroup,
  validateFilter,
} from "../../../src/core/filters/validation.ts";
import type {
  Condition,
  ConditionGroup,
  SmartFilter,
} from "@feedzero/core/types";

const okGroup: ConditionGroup = { kind: "group", match: "all", children: [] };

describe("validateCondition", () => {
  it("accepts well-formed text conditions", () => {
    const c: Condition = { kind: "title", op: "contains", value: "AI" };
    expect(validateCondition(c).ok).toBe(true);
  });

  it("rejects an empty text value (would match everything)", () => {
    const c: Condition = { kind: "title", op: "contains", value: "" };
    expect(validateCondition(c).ok).toBe(false);
  });

  it("rejects whitespace-only text values", () => {
    const c: Condition = { kind: "title", op: "contains", value: "   " };
    expect(validateCondition(c).ok).toBe(false);
  });

  it("accepts a valid regex pattern", () => {
    const c: Condition = { kind: "title", op: "matches", value: "^gpt-\\d+" };
    expect(validateCondition(c).ok).toBe(true);
  });

  it("rejects an invalid regex pattern", () => {
    const c: Condition = { kind: "title", op: "matches", value: "[unterminated" };
    const result = validateCondition(c);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/regex/i);
  });

  it("rejects an empty feed-list", () => {
    const c: Condition = { kind: "feed", op: "in", value: [] };
    expect(validateCondition(c).ok).toBe(false);
  });

  it("rejects between with reversed bounds", () => {
    const c: Condition = {
      kind: "publishedAt",
      op: "between",
      value: [2000, 1000],
    };
    expect(validateCondition(c).ok).toBe(false);
  });

  it("rejects in-last-days with a non-positive value", () => {
    const c: Condition = { kind: "publishedAt", op: "in-last-days", value: 0 };
    expect(validateCondition(c).ok).toBe(false);
  });
});

describe("validateGroup", () => {
  it("accepts an empty group", () => {
    expect(validateGroup(okGroup).ok).toBe(true);
  });

  it("recurses into children and surfaces the first error", () => {
    const group: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        { kind: "title", op: "contains", value: "good" },
        { kind: "title", op: "matches", value: "[bad" },
      ],
    };
    const result = validateGroup(group);
    expect(result.ok).toBe(false);
  });

  it("recurses into nested groups", () => {
    const group: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        {
          kind: "group",
          match: "any",
          children: [{ kind: "title", op: "contains", value: "" }],
        },
      ],
    };
    expect(validateGroup(group).ok).toBe(false);
  });
});

describe("validateFilter", () => {
  it("requires a non-empty trimmed name", () => {
    const f: SmartFilter = {
      id: "x",
      name: "   ",
      rule: okGroup,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(validateFilter(f).ok).toBe(false);
  });

  it("returns ok for a well-formed filter", () => {
    const f: SmartFilter = {
      id: "x",
      name: "Recent AI",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "title", op: "contains", value: "AI" }],
      },
      createdAt: 0,
      updatedAt: 0,
    };
    expect(validateFilter(f).ok).toBe(true);
  });
});
