import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { releases } from "../../release-notes.mjs";

const REPO = path.resolve(__dirname, "../..");

/**
 * Guards the version drift that shipped 0.10/0.11 while package.json and the
 * baked APP_VERSION stayed 0.9.0 (issues #211/#212).
 *
 * This used to compare package.json against a fixture vendored from the LIVE
 * landing feed, which meant the two could disagree between the moment the
 * notes were published and the moment the bump landed — the window that
 * forced landing-first ordering, feed polling and a preflight guard.
 *
 * Now the release notes live in this repository, so a release puts the notes
 * entry and the bump in the SAME COMMIT. They cannot desync, and this test
 * needs no network.
 */
describe("release version lock (#211/#212 drift guard)", () => {
  it("package.json version equals the newest release-notes entry", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO, "package.json"), "utf8"),
    ).version;

    expect(releases[0].version).toBe(pkg);
  });

  it("release notes are ordered newest first", () => {
    // buildFeed takes releases[0] for the feed's <updated> and top entry; an
    // out-of-order list would silently misdate the feed for every subscriber.
    const parts = (v: string) => v.split(".").map(Number);
    for (let i = 1; i < releases.length; i++) {
      const [aMaj, aMin, aPatch] = parts(releases[i - 1].version);
      const [bMaj, bMin, bPatch] = parts(releases[i].version);
      const newer =
        aMaj > bMaj ||
        (aMaj === bMaj && aMin > bMin) ||
        (aMaj === bMaj && aMin === bMin && aPatch > bPatch);
      expect(
        newer,
        `${releases[i - 1].version} should sort newer than ${releases[i].version}`,
      ).toBe(true);
    }
  });

  it("every entry carries the fields the feed builder reads", () => {
    for (const release of releases) {
      for (const field of ["version", "date", "title", "subtitle"] as const) {
        expect(
          typeof release[field],
          `${field} on ${release.version}`,
        ).toBe("string");
      }
    }
  });
});
