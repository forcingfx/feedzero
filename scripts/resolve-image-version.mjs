#!/usr/bin/env node
/**
 * Resolves the version a Docker image should be published under, and proves
 * it agrees with package.json.
 *
 * Extracted from bash-inside-YAML in docker-publish.yml, which chose its
 * source of truth with `if github.event_name == 'workflow_call'`. In a
 * REUSABLE workflow that condition never holds: `github.event_name` reports
 * the event that triggered the CALLING run (for release-tag.yml, `push`).
 * The passed-in version was therefore ignored in favour of the branch name,
 * and the 0.13.0 publish died on `version mismatch: ref/input=main
 * package.json=0.13.0`. Under `workflow_dispatch` the same wrong branch
 * lands in `version` while the mismatch check is skipped — that path would
 * have published an image tagged `main`.
 *
 * Resolution order, independent of event names:
 *   1. explicit input (reusable-workflow call)
 *   2. `v`-prefixed tag ref
 *   3. package.json (branch ref — manual dispatch)
 * The result must always equal package.json; that equality is the #211/#212
 * drift guard, and it now holds on every path.
 *
 * CLI: prints `version=` / `minor=` on stdout for $GITHUB_OUTPUT, narration
 * on stderr, exit 1 on mismatch.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * `release` says whether this invocation should carry the release tags
 * (vX.Y.Z / X.Y / latest) or only a throwaway sha tag. It follows the same
 * precedence as the version — an explicit input or a v-tag means release, a
 * bare branch build does not.
 *
 * @param {{ input: string, refName: string, pkgVersion: string }} params
 * @returns {{ ok: boolean, release: boolean, version: string, minor: string, reason: string }}
 */
export function resolveImageVersion({ input, refName, pkgVersion }) {
  let version;
  let release = true;
  if (input) {
    version = input;
  } else if (refName.startsWith("v")) {
    version = refName.slice(1);
  } else {
    version = pkgVersion;
    release = false;
  }

  const minor = version.split(".").slice(0, 2).join(".");
  if (version !== pkgVersion) {
    return {
      ok: false,
      release,
      version,
      minor,
      reason: `version mismatch: resolved ${version} but package.json is ${pkgVersion}`,
    };
  }
  return {
    ok: true,
    release,
    version,
    minor,
    reason: release
      ? `Publishing release ${version} (tags: v${version}, ${minor}, latest).`
      : `Throwaway build of ${version} (sha tag only).`,
  };
}

function runCli() {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const pkgVersion = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;

  const resolved = resolveImageVersion({
    input: process.argv[2] ?? "",
    refName: process.argv[3] ?? "",
    pkgVersion,
  });

  console.error(resolved.reason);
  console.log(`version=${resolved.version}`);
  console.log(`minor=${resolved.minor}`);
  console.log(`release=${resolved.release}`);

  if (!resolved.ok) {
    console.error(`::error::${resolved.reason}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  runCli();
}
