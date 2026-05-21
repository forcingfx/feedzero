/**
 * Bundle the FeedZero browser extension to extension/dist/.
 *
 * Why a separate build: the extension is a distinct artifact from the SPA.
 * Background SW and content script must each be a standalone JS file the
 * browser loads on its own — no module graph shared with the page. esbuild
 * is enough; we don't need Vite's dev server for the extension.
 *
 * Version sync: the manifest's version is overwritten from package.json so
 * the extension's reported version (used in the ping response) stays in
 * lockstep with the rest of FeedZero.
 */
import esbuild from "esbuild";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "fs";
import path from "path";

const root = path.resolve("extension");
const srcDir = path.join(root, "src");
const outDir = path.join(root, "dist");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const manifest = JSON.parse(
  readFileSync(path.join(root, "manifest.json"), "utf-8"),
);
manifest.version = pkg.version;
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);

await esbuild.build({
  entryPoints: [
    path.join(srcDir, "background.ts"),
    path.join(srcDir, "content-script.ts"),
  ],
  outdir: outDir,
  bundle: true,
  format: "esm",
  target: "chrome119",
  platform: "browser",
  minify: false,
  sourcemap: "linked",
  logLevel: "info",
});

copyFileSync(path.join(srcDir, "popup.html"), path.join(outDir, "popup.html"));

console.log(`✓ Extension built at ${outDir}`);
console.log(`  Version: ${manifest.version}`);
console.log(`  Load unpacked: chrome://extensions → Developer mode → Load unpacked → select ${outDir}`);
