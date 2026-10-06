/**
 * Tells the browser about the service worker that keeps the app openable
 * offline (src/workers/service-worker.js, shipped as /sw.js).
 *
 * The worker is only registered in production builds: the dev server emits
 * no /sw.js, and a worker caching its modules would fight hot reload.
 */

const SERVICE_WORKER_URL = "/sw.js";

interface RegistrationEnvironment {
  /** True in a production build. Passed in so tests can choose. */
  isProduction: boolean;
}

/**
 * Registers the service worker when the build and the browser allow it.
 * Never throws: offline support is an enhancement, and a browser that
 * blocks or lacks service workers must still get a working reader.
 */
export async function registerServiceWorker(
  { isProduction }: RegistrationEnvironment = { isProduction: import.meta.env.PROD },
): Promise<void> {
  if (!isProduction) return;
  // Absent outside a secure context, e.g. a self-hosted instance on plain
  // http over a LAN.
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  } catch {
    // Blocked by a browser setting or out of storage. The app works online.
  }
}
