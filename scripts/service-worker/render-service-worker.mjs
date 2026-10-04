/**
 * Turns the service worker template into the file the build ships at /sw.js.
 *
 * The template (src/workers/service-worker.js) cannot know what a build
 * contains: asset filenames are content-hashed. This injects the build's
 * asset list and an id derived from it. Two things follow from that:
 *
 * - The worker can store every asset at install time, so the app works
 *   offline after one visit instead of only for the chunks that visit
 *   happened to load.
 * - The file's bytes differ between builds. That is the only signal a
 *   browser uses to decide a new worker exists, so without it users would
 *   stay on the worker (and the cached app) they first installed.
 */

/** The line in the template that the manifest replaces. */
export const MANIFEST_MARKER = "/* __BUILD_MANIFEST__ */";

/**
 * @param {string} template  Source of src/workers/service-worker.js.
 * @param {{ buildId: string, assets: string[] }} manifest
 * @returns {string} The worker source to emit as /sw.js.
 */
export function renderServiceWorker(template, { buildId, assets }) {
  if (!template.includes(MANIFEST_MARKER)) {
    throw new Error(
      `Service worker template has no ${MANIFEST_MARKER} marker; refusing to ship a worker without a build manifest.`,
    );
  }
  const manifest = `const BUILD_MANIFEST = ${JSON.stringify({ buildId, assets })};`;
  return template.replace(MANIFEST_MARKER, manifest);
}
