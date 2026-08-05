import { describe, it, expect } from "vitest";
import {
  newestFeedVersion,
  decideTag,
} from "../../../scripts/release/tag-decision.mjs";

const feedWith = (version: string) =>
  `<feed><entry><id>feedzero:release:${version}</id></entry>
   <entry><id>feedzero:release:0.12.0</id></entry></feed>`;

describe("newestFeedVersion", () => {
  it("reads the first release id in document order", () => {
    expect(newestFeedVersion(feedWith("0.13.0"))).toBe("0.13.0");
  });

  it("returns null when the feed has no release entries", () => {
    expect(newestFeedVersion("<feed></feed>")).toBeNull();
  });
});

describe("decideTag", () => {
  it("tags when the version is new and the feed agrees", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      feedVersion: "0.13.0",
      existingTags: ["v0.12.0", "v0.11.0"],
    });
    expect(decision.tag).toBe(true);
    expect(decision.blocking).toBe(false);
  });

  it("skips silently when the tag already exists (idempotent re-run)", () => {
    const decision = decideTag({
      pkgVersion: "0.12.0",
      feedVersion: "0.12.0",
      existingTags: ["v0.12.0"],
    });
    expect(decision.tag).toBe(false);
    // A re-run over an already-released version is normal, not a failure:
    // any push touching package.json re-enters this workflow.
    expect(decision.blocking).toBe(false);
    expect(decision.reason).toMatch(/already/i);
  });

  it("refuses to tag when the landing feed disagrees with package.json", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      feedVersion: "0.12.0",
      existingTags: ["v0.12.0"],
    });
    expect(decision.tag).toBe(false);
    // This is the #211/#212 drift shape — loud, not silent.
    expect(decision.blocking).toBe(true);
    expect(decision.reason).toMatch(/0\.12\.0/);
  });

  it("refuses to tag when the feed could not be read", () => {
    const decision = decideTag({
      pkgVersion: "0.13.0",
      feedVersion: null,
      existingTags: [],
    });
    expect(decision.tag).toBe(false);
    expect(decision.blocking).toBe(true);
  });
});
