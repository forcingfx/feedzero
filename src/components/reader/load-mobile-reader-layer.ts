type MobileReaderLayerModule = typeof import("./mobile-reader-layer.tsx");

let pending: Promise<MobileReaderLayerModule> | null = null;

/**
 * Loads the mobile reader layer's chunk (the swipe-back gesture and the
 * motion library). Memoized, so the feeds route's preload and the lazy
 * component share one request: the preload warms the chunk once the list
 * shows, and the first article then opens without waiting for it.
 * A failed load (offline) is forgotten, so the next call retries.
 */
export function loadMobileReaderLayer(): Promise<MobileReaderLayerModule> {
  pending ??= import("./mobile-reader-layer.tsx").catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
