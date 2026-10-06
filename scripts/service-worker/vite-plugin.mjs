/**
 * Vite plugin: emits the service worker at /sw.js on every production build.
 *
 * The worker has to be served from the site root to control every route in
 * the app, and it has to list the build's hashed assets, which only exist
 * once Rollup has named them. Both are true at `generateBundle`.
 *
 * Dev builds get no worker: nothing is emitted, and the app only registers
 * one in production (src/lib/register-service-worker.ts). A worker caching
 * the dev server's modules would fight hot reload.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderServiceWorker } from "./render-service-worker.mjs";

const TEMPLATE_PATH = path.resolve(import.meta.dirname, "../../src/workers/service-worker.js");
const ASSET_DIR = "assets/";
const BUILD_ID_LENGTH = 12;

/**
 * An id that changes whenever the set of assets does. Asset filenames are
 * content-hashed, so hashing the names is hashing the build.
 *
 * @param {string[]} assets
 * @returns {string}
 */
export function buildIdFor(assets) {
  return createHash("sha256")
    .update([...assets].sort().join("\n"))
    .digest("hex")
    .slice(0, BUILD_ID_LENGTH);
}

export function serviceWorkerPlugin() {
  return {
    name: "feedzero-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((fileName) => fileName.startsWith(ASSET_DIR))
        .map((fileName) => `/${fileName}`)
        .sort();
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker(readFileSync(TEMPLATE_PATH, "utf8"), {
          buildId: buildIdFor(assets),
          assets,
        }),
      });
    },
  };
}
