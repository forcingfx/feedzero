/** Type surface for scripts/service-worker/render-service-worker.mjs. */

/** The line in the template that the manifest replaces. */
export const MANIFEST_MARKER: string;

export interface ServiceWorkerManifest {
  /** Changes whenever the build's assets change. */
  buildId: string;
  /** Site-absolute URLs of every file under /assets/. */
  assets: string[];
}

/** The worker source to emit as /sw.js. Throws if the template has no marker. */
export function renderServiceWorker(template: string, manifest: ServiceWorkerManifest): string;
