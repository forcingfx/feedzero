import { describe, it, expect } from "vitest";
import { decideTag } from "../../../scripts/release/tag-decision.mjs";

describe("decideTag", () => {
  it("tags when the version is new and the notes agree", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      notesVersion: "0.13.0",
      existingTags: ["v0.12.0", "v0.11.0"],
    });
    expect(decision.tag).toBe(true);
    expect(decision.blocking).toBe(false);
  });

  it("skips silently when the tag already exists (idempotent re-run)", () => {
    const decision = decideTag({
      pkgVersion: "0.12.0",
      notesVersion: "0.12.0",
      existingTags: ["v0.12.0"],
    });
    expect(decision.tag).toBe(false);
    // A re-run over an already-released version is normal, not a failure:
    // any push touching package.json re-enters this workflow.
    expect(decision.blocking).toBe(false);
    expect(decision.reason).toMatch(/already/i);
  });

  it("refuses to tag when release-notes.mjs disagrees with package.json", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      notesVersion: "0.12.0",
      existingTags: ["v0.12.0"],
    });
    expect(decision.tag).toBe(false);
    // This is the #211/#212 drift shape — loud, not silent.
    expect(decision.blocking).toBe(true);
    expect(decision.reason).toMatch(/0\.12\.0/);
  });

  it("refuses to tag when the notes list is empty", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      notesVersion: null,
      existingTags: [],
    });
    expect(decision.tag).toBe(false);
    expect(decision.blocking).toBe(true);
  });
});
