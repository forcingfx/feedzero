import { describe, it, expect } from "vitest";
import { createRule, validateRule } from "../../../src/core/storage/schema.ts";
import type { ConditionGroup } from "../../../src/types/index.ts";

const matchAll: ConditionGroup = {
  kind: "group",
  match: "all",
  children: [
    { kind: "title", op: "contains", value: "sponsored" },
  ],
};

describe("createRule", () => {
  it("fills id + timestamps + defaults a disabled rule to enabled", () => {
    const before = Date.now();
    const result = createRule({
      name: "Mute sponsored",
      condition: matchAll,
      actions: [{ kind: "mute" }],
    });
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Mute sponsored");
    expect(result.value.enabled).toBe(true);
    expect(result.value.condition).toEqual(matchAll);
    expect(result.value.actions).toEqual([{ kind: "mute" }]);
    expect(result.value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.value.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.value.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.value.createdAt).toBeLessThanOrEqual(after);
  });

  it("rejects empty and whitespace-only names so the rule list never renders an invisible row", () => {
    expect(createRule({ name: "", condition: matchAll, actions: [{ kind: "mute" }] }).ok).toBe(false);
    expect(createRule({ name: "   ", condition: matchAll, actions: [{ kind: "mute" }] }).ok).toBe(false);
  });

  it("rejects rules with no actions — a rule that does nothing is a smart filter, not a rule", () => {
    const result = createRule({ name: "Empty", condition: matchAll, actions: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects rules with no condition", () => {
    const result = createRule({
      name: "No cond",
      // @ts-expect-error: testing the validation guard at runtime
      condition: undefined,
      actions: [{ kind: "mute" }],
    });
    expect(result.ok).toBe(false);
  });

  it("supports all four v1 action kinds (mute, star, mark-read, route-to-folder)", () => {
    const result = createRule({
      name: "Multi-action",
      condition: matchAll,
      actions: [
        { kind: "mark-read" },
        { kind: "star" },
        { kind: "route-to-folder", folderId: "folder-123" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actions).toHaveLength(3);
  });

  it("preserves an explicit enabled: false so a rule can be paused without deleting it", () => {
    const result = createRule({
      name: "Paused",
      condition: matchAll,
      actions: [{ kind: "mute" }],
      enabled: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.enabled).toBe(false);
  });
});

describe("validateRule", () => {
  it("accepts a well-formed rule", () => {
    const create = createRule({
      name: "X",
      condition: matchAll,
      actions: [{ kind: "mute" }],
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(validateRule(create.value).ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(validateRule(null).ok).toBe(false);
    expect(validateRule(undefined).ok).toBe(false);
    expect(validateRule("rule").ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(validateRule({}).ok).toBe(false);
    expect(validateRule({ id: "x" }).ok).toBe(false);
    expect(validateRule({ id: "x", name: "y", condition: matchAll }).ok).toBe(false);
  });

  it("rejects a route-to-folder action missing folderId — an older vault must not be a runtime crash", () => {
    const bad = {
      id: "id-1",
      name: "Broken",
      enabled: true,
      condition: matchAll,
      actions: [{ kind: "route-to-folder" }],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(validateRule(bad).ok).toBe(false);
  });
});
