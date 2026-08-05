import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

const tracked = () =>
  execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

/**
 * Guards against committing developer-machine artifacts.
 *
 * `.gitignore` listed `node_modules/` — with a trailing slash, which matches
 * only directories. Worktrees created for parallel agent work symlink
 * `node_modules` to the main checkout (CLAUDE.md's worktree recipe), and a
 * symlink is not a directory, so it fell through the ignore rule and was
 * committed by a `git add -A` — embedding an absolute path from one machine
 * into the repository (caught in review on PR #248, never merged).
 */
describe("repo hygiene", () => {
  it("tracks no node_modules entry, directory or symlink", () => {
    const offenders = tracked().filter((f) => f.split("/").includes("node_modules"));
    expect(offenders).toEqual([]);
  });

  it("tracks no absolute-path symlinks", () => {
    // -s selects symlinks (mode 120000) from the index.
    const symlinks = execFileSync(
      "git",
      ["ls-files", "-s"],
      { cwd: REPO, encoding: "utf8" },
    )
      .split("\n")
      .filter((line) => line.startsWith("120000"))
      .map((line) => line.split("\t")[1]!);

    const absolute = symlinks.filter((file) =>
      execFileSync("git", ["show", `:${file}`], {
        cwd: REPO,
        encoding: "utf8",
      }).startsWith("/"),
    );
    expect(absolute).toEqual([]);
  });
});
