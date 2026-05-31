import { describe, it, expect } from "vitest";
import { lintBullet, lintNotes } from "../../../scripts/release/lint-notes.mjs";

describe("lintBullet", () => {
  it("passes a clean past-tense bullet", () =>
    expect(lintBullet("Added a feature.")).toEqual([]));
  it("flags missing terminal period (fixable)", () =>
    expect(lintBullet("Added a feature")).toEqual([
      { rule: "ends-with-period", fixable: true },
    ]));
  it("flags lowercase start (fatal)", () =>
    expect(lintBullet("added a feature.")).toContainEqual({
      rule: "capitalized-start",
      fixable: false,
    }));
  it("flags marketing verbs and emoji (fatal)", () => {
    expect(lintBullet("Seamlessly improved sync.").some((v) => v.rule === "no-marketing-verb")).toBe(true);
    expect(lintBullet("Added sparkle ✨.").some((v) => v.rule === "no-emoji")).toBe(true);
  });
});

describe("lintNotes", () => {
  it("reports field + index for each violation", () => {
    const v = lintNotes({ added: ["Added a feature"], fixed: ["fixed a bug."] });
    expect(v).toContainEqual({ field: "added", index: 0, rule: "ends-with-period", fixable: true });
    expect(v).toContainEqual({ field: "fixed", index: 0, rule: "capitalized-start", fixable: false });
  });
});
