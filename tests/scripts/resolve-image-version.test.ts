import { describe, it, expect } from "vitest";
import { resolveImageVersion } from "../../scripts/resolve-image-version.mjs";

/**
 * The 0.13.0 publish failed with `version mismatch: ref/input=main
 * package.json=0.13.0`. docker-publish.yml chose its source of truth with
 * `if github.event_name == 'workflow_call'` — but in a REUSABLE workflow,
 * `github.event_name` is the event that triggered the CALLING run (here
 * `push`), never `workflow_call`. So the passed-in version was ignored and
 * the branch name was used instead.
 */
describe("resolveImageVersion", () => {
  it("prefers an explicit input (reusable-workflow call)", () => {
    expect(
      resolveImageVersion({
        input: "0.13.0",
        refName: "main",
        pkgVersion: "0.13.0",
      }).version,
    ).toBe("0.13.0");
  });

  it("strips the leading v from a tag ref when there is no input", () => {
    expect(
      resolveImageVersion({
        input: "",
        refName: "v0.13.0",
        pkgVersion: "0.13.0",
      }).version,
    ).toBe("0.13.0");
  });

  it("falls back to package.json for a branch ref (manual dispatch)", () => {
    // Previously this produced version="main" and, because the mismatch
    // check exempted workflow_dispatch, would have published an image
    // tagged `main`.
    const resolved = resolveImageVersion({
      input: "",
      refName: "main",
      pkgVersion: "0.13.0",
    });
    expect(resolved.version).toBe("0.13.0");
    expect(resolved.ok).toBe(true);
  });

  it("rejects a tag that disagrees with package.json (#211/#212 drift)", () => {
    const resolved = resolveImageVersion({
      input: "",
      refName: "v0.11.0",
      pkgVersion: "0.9.0",
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toMatch(/0\.11\.0.*0\.9\.0|0\.9\.0.*0\.11\.0/);
  });

  it("rejects an input that disagrees with package.json", () => {
    expect(
      resolveImageVersion({
        input: "0.14.0",
        refName: "main",
        pkgVersion: "0.13.0",
      }).ok,
    ).toBe(false);
  });

  it("derives the minor tag alongside the full version", () => {
    expect(
      resolveImageVersion({
        input: "0.13.0",
        refName: "main",
        pkgVersion: "0.13.0",
      }).minor,
    ).toBe("0.13");
  });
});
