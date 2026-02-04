/**
 * Bundles each src/api/*.ts serverless function into a self-contained api/*.js file.
 *
 * Vercel's Node.js builder does NOT bundle imports from src/ — it compiles
 * each api/*.ts file individually. This script uses esbuild to inline all
 * dependencies so the output files are self-contained and work in any
 * serverless runtime (Vercel, Cloudflare, plain Node.js).
 *
 * Source: src/api/*.ts (tracked in git)
 * Output: api/*.js (gitignored build artifacts)
 */
import esbuild from "esbuild";
import { readdirSync } from "fs";
import path from "path";

const srcDir = path.resolve("src/api");
const outDir = path.resolve("api");

const entryPoints = readdirSync(srcDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(srcDir, f));

await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: outDir,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@vercel/blob"],
});

console.log(
  `Bundled ${entryPoints.length} API functions:`,
  entryPoints.map((f) => path.basename(f, ".ts") + ".js").join(", "),
);
