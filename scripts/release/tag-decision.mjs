#!/usr/bin/env node
/**
 * Decides whether the version currently on main is a new release to tag.
 *
 * The tag is derived from what is actually ON main — never from an
 * operator-supplied version. v0.11.0 was tagged before its bump landed and
 * the published image reported 0.9.0 (#211/#212); a tag that can only be
 * minted from the merged package.json cannot reproduce that.
 *
 * CLI (used by .github/workflows/release-tag.yml): prints `should_tag` and
 * `version` as key=value lines on STDOUT, which the workflow redirects into
 * $GITHUB_OUTPUT; human-readable narration goes to stderr. Reading
 * $GITHUB_OUTPUT here instead would put a runner-injected variable into the
 * deployment env spec (expected-env.json), which describes what the app
 * needs in production — a different contract.
 *
 * Exits 1 only on a blocking inconsistency — an already-released version is
 * a quiet no-op, because every push touching package.json re-enters this
 * workflow.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
// Static import: see the note in build-feed.mjs about Vite and computed
// dynamic imports.
import { releases } from "../../release-notes.mjs";

/**
 * @param {{ pkgVersion: string, notesVersion: string | null, existingTags: string[] }} inputs
 * @returns {{ tag: boolean, blocking: boolean, reason: string }}
 */
export function decideTag({ pkgVersion, notesVersion, existingTags }) {
  if (existingTags.includes(`v${pkgVersion}`)) {
    return {
      tag: false,
      blocking: false,
      reason: `v${pkgVersion} already tagged — nothing to release.`,
    };
  }
  if (notesVersion === null) {
    return {
      tag: false,
      blocking: true,
      reason: "release-notes.mjs has no entries; refusing to tag.",
    };
  }
  if (notesVersion !== pkgVersion) {
    return {
      tag: false,
      blocking: true,
      reason:
        `release-notes.mjs newest is ${notesVersion} but package.json is ${pkgVersion}. ` +
        "A release commit must bump both together.",
    };
  }
  return { tag: true, blocking: false, reason: `Tagging v${pkgVersion}.` };
}

async function runCli() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const pkgVersion = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;

  // Read from the repository, not the network. The notes and the bump land in
  // the same commit, so a live fetch could only introduce a way for them to
  // disagree — which is exactly the window that used to force landing-first
  // ordering and feed polling.
  const notesVersion = releases[0]?.version ?? null;

  const existingTags = execFileSync("git", ["tag", "-l", "v*"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const decision = decideTag({ pkgVersion, notesVersion, existingTags });
  console.error(decision.reason);
  console.log(`should_tag=${decision.tag}`);
  console.log(`version=${pkgVersion}`);

  if (decision.blocking) {
    console.error(`::error::${decision.reason}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await runCli();
}
