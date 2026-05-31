import { describe, it, expect } from "vitest";
import { toHouseStyle, draftNotes } from "../../../scripts/release/draft-notes.ts";

describe("toHouseStyle", () => {
  it("capitalizes, ensures terminal period, replaces em-dash, drops exclamation", () => {
    expect(toHouseStyle("added a thing — really!")).toBe("Added a thing, really.");
  });
  it("leaves backticks intact (build-releases turns them into <code>)", () => {
    expect(toHouseStyle("set `FOO`")).toBe("Set `FOO`.");
  });
});

describe("draftNotes", () => {
  it("buckets feat→added, fix→fixed, perf/refactor→changed; ignores chore/docs", () => {
    const entry = draftNotes(
      ["feat: add A", "fix: fix B", "perf: speed C", "chore: bump dep", "docs: tweak"],
      { version: "0.12.0", date: "2026-06-01T12:00:00Z" },
    );
    expect(entry.version).toBe("0.12.0");
    expect(entry.added).toEqual(["Add A."]);
    expect(entry.fixed).toEqual(["Fix B."]);
    expect(entry.changed).toEqual(["Speed C."]);
    expect(entry.title).toBe("Add A");
    expect(entry.subtitle).toBe("1 added, 1 changed, 1 fixed.");
  });
  it("omits empty sections and falls back to a maintenance title", () => {
    const entry = draftNotes(["refactor: tidy"], { version: "0.12.0", date: "2026-06-01T12:00:00Z" });
    expect(entry.added).toBeUndefined();
    expect(entry.changed).toEqual(["Tidy."]);
    expect(entry.title).toBe("Tidy");
  });
});
