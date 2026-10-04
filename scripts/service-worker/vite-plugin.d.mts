/** Type surface for scripts/service-worker/vite-plugin.mjs. */

/** An id that changes whenever the set of assets does. */
export function buildIdFor(assets: string[]): string;

/** Emits the rendered service worker as /sw.js on production builds. */
export function serviceWorkerPlugin(): {
  name: string;
  apply: "build";
  generateBundle(
    this: { emitFile(file: { type: "asset"; fileName: string; source: string }): unknown },
    options: unknown,
    bundle: Record<string, unknown>,
  ): void;
};
