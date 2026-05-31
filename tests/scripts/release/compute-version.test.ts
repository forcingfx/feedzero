import { describe, it, expect } from "vitest";
import {
  parseConventional,
  computeBump,
  nextVersion,
  computeVersion,
} from "../../../scripts/release/compute-version.ts";

describe("parseConventional", () => {
  it("parses type, scope, breaking, description", () => {
    expect(parseConventional("feat(reader): add X")).toEqual({
      type: "feat",
      scope: "reader",
      breaking: false,
      description: "add X",
    });
    expect(parseConventional("fix!: drop Y")).toEqual({
      type: "fix",
      scope: null,
      breaking: true,
      description: "drop Y",
    });
  });
  it("flags BREAKING CHANGE in the subject", () => {
    expect(parseConventional("feat: z BREAKING CHANGE: w").breaking).toBe(true);
  });
  it("returns type null for non-conventional subjects", () => {
    expect(parseConventional("just words").type).toBeNull();
  });
});

describe("computeBump", () => {
  it("major on any breaking", () =>
    expect(computeBump(["feat: a", "fix!: b"])).toBe("major"));
  it("minor on any feat (no breaking)", () =>
    expect(computeBump(["fix: a", "feat: b"])).toBe("minor"));
  it("patch on fix/perf only", () =>
    expect(computeBump(["fix: a", "perf: b"])).toBe("patch"));
  it("null when nothing releasable", () =>
    expect(computeBump(["chore: a", "docs: b", "test: c"])).toBeNull());
});

describe("nextVersion / computeVersion", () => {
  it("bumps correctly", () => {
    expect(nextVersion("0.11.0", "major")).toBe("1.0.0");
    expect(nextVersion("0.11.0", "minor")).toBe("0.12.0");
    expect(nextVersion("0.11.3", "patch")).toBe("0.11.4");
    expect(nextVersion("0.11.0", null)).toBeNull();
  });
  it("computeVersion composes parse+bump+next", () => {
    expect(computeVersion("0.11.0", ["feat: a"])).toBe("0.12.0");
    expect(computeVersion("0.11.0", ["chore: a"])).toBeNull();
  });
});
