/**
 * FeedZero's service worker: keeps the app openable with no connection.
 *
 * Article data already lives on the device (encrypted IndexedDB). What was
 * missing was the app itself: the page and its scripts. This worker stores
 * those, and nothing else.
 *
 * The build replaces the marker below with the list of hashed assets and a
 * build id (scripts/service-worker/render-service-worker.mjs) and emits the
 * result as /sw.js. This file is never served as-is.
 *
 * See docs/decisions/033-offline-app-shell.md for the reasoning behind each
 * rule here.
 */

/* __BUILD_MANIFEST__ */

// One cache per build. A new build installs into a fresh cache and the old
// one is deleted on activation, so storage stays bounded at one build.
const CACHE_PREFIX = "feedzero-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_MANIFEST.buildId}`;

// Every in-app route is served by the same page.
const APP_PAGE = "/index.html";

// Small files the installed app needs to look right offline.
const SHELL_FILES = [
  APP_PAGE,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...SHELL_FILES, ...BUILD_MANIFEST.assets]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * The app page: network first, stored copy only when the network fails.
 *
 * Cache-first here would pin every user to the page they first stored, and
 * with it to that build's scripts, until the worker itself changed. Network
 * first means an online user always gets the current release.
 */
async function appPage(request) {
  try {
    return await fetch(request);
  } catch (networkError) {
    const stored = await caches.match(APP_PAGE);
    if (stored) return stored;
    throw networkError;
  }
}

/**
 * Hashed assets: stored copy first. The filename changes whenever the bytes
 * do, so a stored copy can never be stale. Assets fetched on a miss are kept,
 * which covers chunks added to the cache after install.
 */
async function hashedAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const stored = await cache.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Icons and the manifest: network first, stored copy when offline. */
async function shellFile(request) {
  try {
    return await fetch(request);
  } catch (networkError) {
    const stored = await caches.match(request);
    if (stored) return stored;
    throw networkError;
  }
}

/**
 * Decides who answers a request. Returning nothing leaves it to the browser,
 * exactly as if no worker were installed. That is the default: only the
 * three cases below are handled.
 */
function handlerFor(request) {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  // /api/* carries vault ciphertext, licence tokens and feed bodies. None of
  // it may be answered from, or written to, a cache.
  if (url.pathname.startsWith("/api/")) return null;

  if (request.mode === "navigate") return appPage;
  if (url.pathname.startsWith("/assets/")) return hashedAsset;
  if (SHELL_FILES.includes(url.pathname)) return shellFile;
  return null;
}

self.addEventListener("fetch", (event) => {
  const handler = handlerFor(event.request);
  if (handler) event.respondWith(handler(event.request));
});
