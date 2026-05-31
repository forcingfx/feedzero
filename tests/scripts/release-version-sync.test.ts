import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

// Guards the version drift that shipped 0.10/0.11 while package.json + the
// baked APP_VERSION stayed 0.9.0 (issues #211/#212). The vendored fixture is
// the in-repo stand-in for what the landing changelog published, refreshed
// on every release; keeping package.json equal to its newest entry ties the
// app's reported version to the published release notes.
describe("release version lock (#211/#212 drift guard)", () => {
  it("package.json version equals the newest vendored release-feed entry", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO, "package.json"), "utf8"),
    ).version;
    const xml = readFileSync(
      path.join(REPO, "tests/fixtures/release-feed.xml"),
      "utf8",
    );
    const newest = /<id>feedzero:release:([0-9][0-9.]*)<\/id>/.exec(xml)?.[1];
    expect(newest, "no release id found in vendored fixture").toBeTruthy();
    expect(newest).toBe(pkg);
  });
});
