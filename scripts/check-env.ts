#!/usr/bin/env tsx
/**
 * Env-spec audit driver.
 *
 * Two modes:
 *
 *  1. **Lint mode** (default — `npm run check-env`): Scans the repo for env
 *     references, compares against `expected-env.json`, fails if any
 *     reference is undocumented or any spec entry is unused. CI runs this
 *     so a new `process.env.X` can't land without a one-line spec entry.
 *
 *  2. **Audit mode** (`npm run check-env -- --env <path>`): Additionally
 *     reads a `.env`-format file (e.g. the output of
 *     `vercel env pull .env.production.local`) and reports names that the
 *     spec marks as required-for-production but are missing from the file,
 *     names set in the file that aren't documented in the spec (the
 *     2026-05-12 incident shape), and names that are required only for a
 *     different deployment target (eg. SELF_HOSTED set in the Vercel env).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditEnvSpec,
  parseEnvFile,
  scanEnvReferences,
  type EnvSpec,
  type DeploymentTarget,
} from "../src/core/env-audit/audit.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SCAN_DIRS = ["src", "api", "scripts"];
const SCAN_FILES = ["server.ts", "vite.config.js"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vercel", "coverage"]);
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".cjs", ".mjs"];

/**
 * Files whose `env.X` mentions are documentation, not real references.
 * The audit module documents its own grammar with `env.NAME` examples in
 * JSDoc; including them in the scan would flag NAME / X as undocumented.
 */
const SKIP_FILES = new Set<string>([
  "src/core/env-audit/audit.ts",
  "scripts/check-env.ts",
]);

interface CliArgs {
  envFilePath: string | null;
  deploymentTarget: DeploymentTarget;
}

function parseArgs(argv: string[]): CliArgs {
  let envFilePath: string | null = null;
  let deploymentTarget: DeploymentTarget = "production";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) {
      envFilePath = argv[++i]!;
    } else if (arg === "--target" && argv[i + 1]) {
      const next = argv[++i]!;
      if (next !== "production" && next !== "self-host") {
        throw new Error(`--target must be production|self-host, got "${next}"`);
      }
      deploymentTarget = next;
    }
  }
  return { envFilePath, deploymentTarget };
}

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (stat.isFile()) {
      if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        yield full;
      }
    }
  }
}

function collectReferencedNames(): Set<string> {
  const referenced = new Set<string>();
  const visit = (file: string): void => {
    const relPath = relative(REPO_ROOT, file).replaceAll("\\", "/");
    if (SKIP_FILES.has(relPath)) return;
    const source = readFileSync(file, "utf8");
    for (const name of scanEnvReferences(source)) {
      referenced.add(name);
    }
  };
  for (const sub of SCAN_DIRS) {
    const root = join(REPO_ROOT, sub);
    try {
      for (const file of walkSourceFiles(root)) visit(file);
    } catch (err) {
      // Missing optional dirs (eg. no scripts dir) are not fatal.
      if (
        !(err instanceof Error && /ENOENT/.test(err.message))
      ) {
        throw err;
      }
    }
  }
  for (const file of SCAN_FILES) {
    try {
      visit(join(REPO_ROOT, file));
    } catch {
      // File optional.
    }
  }
  return referenced;
}

function loadSpec(): EnvSpec {
  const raw = readFileSync(join(REPO_ROOT, "expected-env.json"), "utf8");
  const parsed = JSON.parse(raw) as { spec: EnvSpec };
  return parsed.spec;
}

function reportSection(label: string, items: string[]): void {
  if (items.length === 0) return;
  console.error(`\n${label}:`);
  for (const item of items) console.error(`  • ${item}`);
}

function relativePathOrAbsolute(path: string): string {
  return relative(REPO_ROOT, path) || path;
}

function main(): number {
  const { envFilePath, deploymentTarget } = parseArgs(process.argv.slice(2));
  const spec = loadSpec();
  const referenced = collectReferencedNames();

  let deployedEnv: Set<string> | undefined;
  if (envFilePath) {
    const text = readFileSync(envFilePath, "utf8");
    deployedEnv = parseEnvFile(text);
    console.log(
      `[check-env] Auditing against ${relativePathOrAbsolute(
        resolve(envFilePath),
      )} (target=${deploymentTarget}, ${deployedEnv.size} names)`,
    );
  } else {
    console.log(
      `[check-env] Lint mode — comparing source references against expected-env.json.`,
    );
  }

  const report = auditEnvSpec({
    spec,
    referenced,
    deployedEnv,
    deploymentTarget,
  });

  if (report.isClean) {
    console.log(
      `[check-env] ✅ Clean. ${referenced.size} references / ${
        Object.keys(spec).length
      } documented.`,
    );
    return 0;
  }

  reportSection("Source references missing from spec", report.undocumented);
  reportSection("Spec entries no source references", report.unused);
  reportSection(
    `Required for ${deploymentTarget} but missing from deployment`,
    report.missingFromDeployment,
  );
  reportSection(
    `Set in deployment but not required for ${deploymentTarget}`,
    report.staleInDeployment,
  );
  reportSection(
    "Set in deployment but undocumented in spec",
    report.undocumentedInDeployment,
  );

  console.error("\n[check-env] ❌ Spec drift detected. See sections above.");
  return 1;
}

process.exit(main());
