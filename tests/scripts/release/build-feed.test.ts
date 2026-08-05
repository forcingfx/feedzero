import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFeed, buildNotesJson } from "../../../scripts/release/build-feed.mjs";
import { releases } from "../../../release-notes.mjs";

const REPO = path.resolve(__dirname, "../../..");

/**
 * The Atom feed at https://feedzero.app/releases.xml has live subscribers:
 * the app auto-subscribes to it on first launch. Moving the feed's source of
 * truth from the landing repo into this one must be invisible to them —
 * same URL (preserved by a rewrite in landing), same bytes, same entry ids.
 *
 * The fixture is the feed exactly as served at the time of the move. If this
 * test fails, subscribers would see churn: changed ids re-import every entry
 * as new, and changed bytes mean the two generators have diverged.
 */
describe("buildFeed — byte compatibility with the published feed", () => {
  const expected = readFileSync(
    path.join(REPO, "tests/fixtures/release-feed.xml"),
    "utf8",
  );

  it("reproduces the published feed byte for byte", () => {
    expect(buildFeed(releases)).toBe(expected);
  });

  it("preserves the feed id, which subscribers key on", () => {
    expect(buildFeed(releases)).toContain("<id>feedzero:changelog</id>");
  });

  it("preserves every entry id", () => {
    const ids = (xml: string) =>
      [...xml.matchAll(/<id>(feedzero:release:[0-9.]+)<\/id>/g)].map((m) => m[1]);
    expect(ids(buildFeed(releases))).toEqual(ids(expected));
  });

  it("puts the newest release first, which drives <updated>", () => {
    const feed = buildFeed(releases);
    const firstEntry = feed.indexOf("<entry>");
    expect(feed.slice(firstEntry)).toContain(
      `<id>feedzero:release:${releases[0].version}</id>`,
    );
  });
});

/**
 * The landing page renders its release accordion from this JSON rather than
 * parsing the Atom feed. Keeping the structured data available means the two
 * repos share one source of truth without landing needing an XML parser.
 */
describe("buildNotesJson", () => {
  it("emits the release list as JSON with a trailing newline", () => {
    const json = buildNotesJson(releases);
    expect(JSON.parse(json)).toHaveLength(releases.length);
    expect(json.endsWith("\n")).toBe(true);
  });

  it("preserves version, date, title and body sections", () => {
    const [newest] = JSON.parse(buildNotesJson(releases));
    expect(newest.version).toBe(releases[0].version);
    expect(newest.date).toBe(releases[0].date);
    expect(newest.title).toBe(releases[0].title);
  });
});
