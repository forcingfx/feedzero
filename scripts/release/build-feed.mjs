#!/usr/bin/env node
/**
 * Generates the release-notes artefacts from release-notes.mjs:
 *
 *   public/releases.xml  — the Atom feed the app subscribes to
 *   public/releases.json — the same data, for the landing page's accordion
 *
 * Vite copies public/ into dist/, so both are served statically from
 * my.feedzero.app with no serverless function involved.
 *
 * WHY THIS LIVES HERE. The feed used to be generated in the landing repo,
 * which forced every release into a two-repo dance: publish landing, poll
 * until the feed went live, only then bump and tag the app. That ordering
 * caused the polling loop, a preflight guard, and a class of failure where a
 * half-finished release left the two repos disagreeing. With the notes in
 * this repo the notes entry and the version bump land in the SAME COMMIT, so
 * they cannot desync and there is nothing to sequence.
 *
 * The public URL does not move: landing rewrites /releases.xml to
 * my.feedzero.app/releases.xml, so existing subscribers see the same URL and
 * the same bytes. Entry ids (feedzero:release:<version>) and the feed id
 * (feedzero:changelog) are load-bearing — changing one makes every
 * subscriber re-import every entry as new.
 *
 * Ported from the landing repo's build-releases.mjs. The generator is kept
 * byte-identical on purpose and pinned by
 * tests/scripts/release/build-feed.test.ts against the feed as published.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Static import on purpose: a computed `await import()` makes Vite treat this
// as browser code and inject its dynamic-import helper ahead of the shebang.
// CLAUDE.md bans dynamic in-tree imports for a related reason (the 2026-05-23
// prod-bundle boot crash).
import { releases } from "../../release-notes.mjs";

const FEED_URL = "https://feedzero.app/releases.xml";
const PAGE_URL = "https://feedzero.app/#releases";

/** Release sections rendered in order; each maps to a field on a release. */
const SECTIONS = [
  { key: "added", label: "Added" },
  { key: "changed", label: "Changed" },
  { key: "fixed", label: "Fixed" },
  { key: "removed", label: "Removed" },
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toTimestamp(date) {
  return date.includes("T") ? date : `${date}T00:00:00Z`;
}

function presentSections(release) {
  return SECTIONS.filter(
    ({ key }) => Array.isArray(release[key]) && release[key].length > 0,
  );
}

/**
 * After escaping, turn `foo` into <code>foo</code> so note authors can write
 * inline code with backticks.
 */
function codeify(text) {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Re-allow a small whitelist of inline tags. Authors write bullets as plain
 * English with the occasional <code>, <kbd> or <strong>; without this they
 * would render as literal "&lt;code&gt;".
 *
 * Keep this list in step with the landing repo's lib/releases.mjs until that
 * copy is deleted — the byte-compatibility test is what catches drift.
 */
function unescapeInlineTags(text) {
  for (const tag of ["code", "kbd", "strong"]) {
    text = text
      .replace(new RegExp(`&lt;${tag}&gt;`, "g"), `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, "g"), `</${tag}>`);
  }
  return text;
}

function renderItem(item) {
  return unescapeInlineTags(codeify(escapeXml(item)));
}

function buildEntryContent(release) {
  const parts = [];
  if (release.subtitle) parts.push(`<p>${escapeXml(release.subtitle)}</p>`);
  for (const { key, label } of presentSections(release)) {
    parts.push(`<h3>${label}</h3>`);
    parts.push("<ul>");
    for (const item of release[key]) {
      parts.push(`  <li>${renderItem(item)}</li>`);
    }
    parts.push("</ul>");
  }
  return parts.join("\n");
}

function buildEntry(release) {
  const content = buildEntryContent(release);
  const ts = toTimestamp(release.date);
  return `  <entry>
    <id>feedzero:release:${escapeXml(release.version)}</id>
    <title>v${escapeXml(release.version)}: ${escapeXml(release.title)}</title>
    <link rel="alternate" href="${PAGE_URL}" />
    <published>${ts}</published>
    <updated>${ts}</updated>
    <summary>${escapeXml(release.subtitle)}</summary>
    <content type="html"><![CDATA[${content}]]></content>
    <author><name>FeedZero</name></author>
  </entry>`;
}

/**
 * The Atom feed. `<updated>` comes from the newest release's date rather than
 * the current clock, so regenerating without a release change is a no-op —
 * a churning timestamp would republish an unchanged feed to every subscriber.
 *
 * @param {Array<object>} releases newest first
 * @returns {string} Atom XML
 */
export function buildFeed(releases) {
  const updated = toTimestamp(releases[0]?.date ?? new Date().toISOString());
  const entries = releases.map(buildEntry).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FeedZero Release Notes</title>
  <subtitle>What changed in FeedZero.</subtitle>
  <id>feedzero:changelog</id>
  <updated>${updated}</updated>
  <link rel="self" href="${FEED_URL}" />
  <link rel="alternate" type="text/html" href="${PAGE_URL}" />
  <author>
    <name>FeedZero</name>
  </author>
${entries}
</feed>
`;
}

/**
 * The same releases as JSON, so the landing page can render its accordion
 * without shipping an XML parser.
 *
 * @param {Array<object>} releases
 * @returns {string} pretty-printed JSON with a trailing newline
 */
export function buildNotesJson(releases) {
  return `${JSON.stringify(releases, null, 2)}\n`;
}

async function runCli() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

  await writeFile(join(repoRoot, "public/releases.xml"), buildFeed(releases));
  await writeFile(
    join(repoRoot, "public/releases.json"),
    buildNotesJson(releases),
  );
  console.error(
    `Wrote public/releases.xml and public/releases.json (${releases.length} releases, newest ${releases[0].version}).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await runCli();
}
