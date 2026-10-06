# ADR 033: Offline App Shell via a Per-Build Service Worker

## Status
Accepted (2026-10-04).

## Context

The landing page promises "Loaded articles stay readable without a
connection", and the paid tier sells offline prefetch. Article data has
always been on the device (encrypted IndexedDB). The app that displays
it was not: with no connection, opening `my.feedzero.app` failed with
`ERR_INTERNET_DISCONNECTED`. Offline reading worked only for a tab that
was already open.

A service worker had existed since the first commit
(`src/workers/service-worker.js`). Two things made it dead:

- **Nothing registered it.** The React migration (`6ff5d11`,
  2026-02-01) dropped the `navigator.serviceWorker.register` call.
  Nothing failed, because an unregistered worker is silent.
- **Nothing shipped it.** The file sat in `src/workers/` with no build
  step, so `/sw.js` fell through to the SPA rewrite and returned the
  HTML page with a 200.

Restoring the old file as it was would have been worse than leaving it
dead. It served the app page cache-first under a fixed cache name, so
every user would have been pinned to the page, and therefore the build,
they first stored.

## Decision

### One cache per build, filled at install

The build renders the worker template with the list of hashed assets
and an id derived from that list
(`scripts/service-worker/vite-plugin.mjs`, `render-service-worker.mjs`)
and emits it at `/sw.js`.

- At install the worker stores the app page, the icons and manifest,
  and **every** asset in the build. One visit is enough to work
  offline; it does not depend on which chunks that visit happened to
  load.
- The cache is named after the build id. A new build installs into a
  new cache and deletes the others on activation, so storage is bounded
  at one build.
- Because the id is in the file, each build ships different bytes. That
  is the only signal a browser uses to detect a new worker.

### The app page is network-first

An online user always gets the page from the network, so a release
reaches them on the next load. The stored page is used only when the
network request fails, and it answers every in-app route, since they
are all the same page.

### Hashed assets are cache-first

A hashed filename changes whenever its bytes change, so a stored asset
cannot be stale.

### Everything else is left to the browser

The worker handles three kinds of request and returns nothing for the
rest, which is the same as having no worker:

- `/api/*` is never handled. It carries vault ciphertext, licence
  tokens and feed bodies; none of it may be answered from, or written
  to, a cache.
- Other origins (article images) are never handled.
- `/releases.xml`, `/releases.json` and `/sw.js` itself are never
  handled.
- Non-GET requests are never handled.

### `/sw.js` is served `no-cache`

Both static hosts set it (`vercel.json`, `server.ts`). A worker runs
from the user's browser, so the only fix for a bad one is shipping a
good `/sw.js`.

### Registered in production builds only

`src/lib/register-service-worker.ts` is called from `src/main.tsx`. It
does nothing in development (the dev server emits no worker, and one
would fight hot reload), nothing where the browser has no support (a
self-hosted instance on plain http over a LAN), and it never throws.

## Consequences

- The app opens offline after one online visit, on any route.
- Each release costs a returning user one background re-download of the
  build's assets (about 2.4 MB uncompressed today). Unchanged vendor
  chunks come from the HTTP cache, where they are immutable.
- A tab left open across a release keeps running the old build. If it
  then lazy-loads a chunk that the new worker has already evicted, the
  request goes to the network and fails, as it did before this change.
  Reloading fixes it.
- Feed content is not in the worker's cache. It stays in the encrypted
  database, so the privacy model is unchanged: the worker stores only
  what the server sends to every visitor.
- The page a user is on while the worker first activates may not be
  controlled by it. That is harmless: the next navigation is.
- **Kill switch.** If a worker ever misbehaves, ship a `/sw.js` whose
  install handler calls `skipWaiting()` and whose activate handler
  deletes every cache and calls `registration.unregister()`.

## Verification

- `tests/workers/service-worker.test.ts` runs the rendered worker
  against fake `caches` and `fetch`.
- `tests/e2e/offline.spec.ts` (the `offline` Playwright project) goes
  offline in a real browser against a production build and reopens the
  app.
- `tests/smoke/service-worker.test.ts` checks the deployed `/sw.js` is
  JavaScript, is `no-cache`, and lists assets that exist.

## Alternatives considered

- **Restore the old worker and its registration.** Rejected: its
  cache-first page under a fixed cache name pins users to a build.
- **Workbox / vite-plugin-pwa.** Does this and much more. Rejected for
  now: the rules here are about sixty lines, every one of them is a
  privacy or update decision worth reading, and a generated worker
  would put them out of sight.
- **Cache assets only as they are requested, no manifest.** Simpler,
  but the first visit's assets load before the worker controls the
  page, so they are never stored and the app does not work offline
  until a second online visit. It also leaves lazy routes unavailable
  offline until each has been opened online.
- **A "new version available, reload" prompt.** Would address the
  open-tab case above. Not built: network-first already updates on the
  next load, and the prompt is UI work with its own states.
