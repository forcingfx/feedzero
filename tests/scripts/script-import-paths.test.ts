import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `tsconfig.json` includes only `src`, `tests` and `packages/core/src`, so
 * `npx tsc --noEmit` never type-checks anything under `scripts/`. The operator
 * CLIs there are run by hand, months apart, usually during an incident — which
 * is the worst moment to discover that an import path was wrong the whole time.
 *
 * That is not hypothetical: `scripts/find-license.ts` shipped in PR #106
 * importing `../src/utils/result`, a path that has never existed (the module
 * lives at `packages/core/src/utils/result`). The license-support runbook
 * documented a CLI that crashed on startup for every operator who tried it.
 *
 * This test resolves every relative import in every script and asserts the
 * target file exists. It is deliberately static — importing the scripts would
 * execute them, since each one calls `main()` at module scope.
 */

const SCRIPTS_DIR = resolve(__dirname, "../../scripts");
const EXTENSIONS = ["", ".ts", ".mts", ".js", ".mjs", ".d.ts", "/index.ts"];

function scriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return scriptFiles(full);
    return entry.isFile() && /\.(ts|mts|mjs)$/.test(entry.name) ? [full] : [];
  });
}

/** Relative specifiers only — bare package names are npm's problem, not ours. */
function relativeImports(source: string): string[] {
  const pattern = /(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g;
  return [...source.matchAll(pattern)].map((m) => m[1]);
}

function resolvesToAFile(fromFile: string, specifier: string): boolean {
  const base = resolve(dirname(fromFile), specifier);
  return EXTENSIONS.some((ext) => existsSync(base + ext));
}

describe("scripts/ import paths", () => {
  const files = scriptFiles(SCRIPTS_DIR);

  it("finds scripts to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(SCRIPTS_DIR.length + 1), f]))(
    "%s imports only paths that exist",
    (_name, file) => {
      const broken = relativeImports(readFileSync(file, "utf8")).filter(
        (specifier) => !resolvesToAFile(file, specifier),
      );

      expect(broken).toEqual([]);
    },
  );
});
