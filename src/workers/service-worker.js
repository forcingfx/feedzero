const CACHE_NAME = "feedzero-v2";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

/**
 * Runtime asset caching for the per-vendor split bundles.
 *
 * Vite emits content-hashed asset filenames under /assets/. Because the
 * filename changes whenever the bytes change, a URL→response cache is
 * always coherent (different bytes get a different URL; the same URL
 * can never serve stale content). Caching them aggressively converts
 * a returning visit from ~500 KB / 10 requests to a 0-network warm
 * start. Old entries (left over from prior releases) sit harmlessly
 * until the browser reclaims storage; only assets we've actually
 * touched end up in cache, so growth is bounded by the user's session.
 *
 * The strategy is cache-first; if the asset isn't cached we fetch and
 * tee the response into the cache for next time.
 */
async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first for feed fetches (external URLs)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
    return;
  }

  // Hashed assets: cache-first, tee on miss.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
