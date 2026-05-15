/**
 * Replaces each api/*.ts with a self-contained esbuild bundle (keeping .ts extension).
 *
 * Why: Vercel discovers api/*.ts pre-build and expects them post-build. If we delete
 * them, Vercel errors with "File not found". If we output .js alongside .ts, Vercel
 * re-compiles .ts and overwrites .js. By replacing .ts content with the bundled output
 * (all dependencies inlined, no external imports), Vercel compiles them trivially.
 *
 * The original .ts source is tracked in git. This script only modifies the build
 * working copy — git source is not affected.
 */
import esbuild from "esbuild";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";

const apiDir = path.resolve("api");

// Read the current package.json version so we can inline it into every
// serverless bundle as `process.env.APP_VERSION`. Without this, the
// /api/health endpoint reports "unknown" (the fallback in
// src/core/health/health-handler.ts) and operators lose the canonical
// "is the right code on prod" signal.
const pkgVersion = JSON.parse(
  readFileSync(path.resolve("package.json"), "utf-8"),
).version;

/**
 * Recursively collect every `.ts` file under api/. Vercel maps subdirectories
 * to URL path segments (`api/stripe/webhook.ts` → `/api/stripe/webhook`), so
 * nested layouts must be preserved in the bundled output.
 */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const tsFiles = collectTsFiles(apiDir);

if (tsFiles.length === 0) {
  throw new Error("No api/*.ts files found to bundle.");
}

// Bundle to a temp directory to avoid overwriting source mid-build
const tempOut = mkdtempSync(path.join(tmpdir(), "feedzero-api-"));

try {
  await esbuild.build({
    entryPoints: tsFiles,
    bundle: true,
    outdir: tempOut,
    outbase: apiDir,
    format: "esm",
    platform: "node",
    target: "node20",
    // Externals: packages Vercel installs from production deps at deploy
    // time. Marking them external avoids inlining — which both balloons
    // wrapper size (Stripe SDK is ~700KB inlined) and pulls in Node-specific
    // code paths esbuild handles poorly (causing Vercel deploy errors).
    external: ["@vercel/blob", "stripe", "@upstash/redis"],
    // Inline `process.env.APP_VERSION` as a string literal so the health
    // handler reports the build's version without depending on a Vercel
    // env var being set. Tied to package.json — the release-bump commit
    // is the single source of truth for what gets reported.
    define: {
      "process.env.APP_VERSION": JSON.stringify(pkgVersion),
    },
  });

  // Map each source api/.../X.ts to its corresponding tempOut/.../X.js bundle.
  // outbase=apiDir tells esbuild to mirror the subdir layout, so the relative
  // path from apiDir is preserved (api/stripe/webhook.ts → tempOut/stripe/webhook.js).
  const bundlePathFor = (tsFile) => {
    const rel = path.relative(apiDir, tsFile);
    return path.join(tempOut, rel.replace(/\.ts$/, ".js"));
  };

  // Validate bundled output before overwriting source
  for (const tsFile of tsFiles) {
    const bundledPath = bundlePathFor(tsFile);
    const bundledContent = readFileSync(bundledPath, "utf-8");

    if (!bundledContent || bundledContent.length === 0) {
      throw new Error(`Empty bundle output for ${tsFile}`);
    }
    if (bundledContent.includes("../src/")) {
      throw new Error(
        `Bundle for ${tsFile} contains unbundled ../src/ imports`,
      );
    }
  }

  // Overwrite api/.../*.ts with bundled .js content (Vercel expects .ts extension).
  // Prepend // @ts-nocheck because the bundled output is esbuild-emitted JS that
  // violates the project's strict tsconfig (implicit any, etc.) and gets pulled
  // into typecheck via tests/server.test.ts contract imports. The src/ originals
  // are still typechecked normally; bundles are build artifacts, not source.
  const TS_NOCHECK_HEADER = "// @ts-nocheck\n";
  for (const tsFile of tsFiles) {
    const bundledContent = readFileSync(bundlePathFor(tsFile), "utf-8");
    writeFileSync(tsFile, TS_NOCHECK_HEADER + bundledContent);
  }

  console.log(
    `Bundled ${tsFiles.length} API functions (in-place):`,
    tsFiles.map((f) => path.relative(apiDir, f)).join(", "),
  );
} finally {
  // Clean up temp directory regardless of success or failure
  rmSync(tempOut, { recursive: true, force: true });
}
