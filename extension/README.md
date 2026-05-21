# FeedZero browser extension

This extension lets you read your paid subscriptions inside FeedZero by
fetching article HTML using the cookies already in your browser. Credentials
never touch FeedZero's servers — every authenticated fetch happens locally,
authorized per-publisher.

Status: Phase 1 (ping handshake) and Phase 2 (authenticated `fetch-article`) are implemented. The reader-pane UI that triggers authorization and surfaces paywall verdicts is the next phase — until it lands, the web app does not yet *call* `fetchArticle()` automatically; you can drive the round-trip from the devtools console as a smoke test.

## Architecture

```
Page (my.feedzero.app)
   │ window.postMessage({ type: "feedzero/ping", requestId, … })
   ▼
content-script.js  (runs in the page's world, origin-pinned)
   │ chrome.runtime.sendMessage
   ▼
background.js      (MV3 service worker)
   │ handleMessage → { type: "feedzero/ping-response", … }
   ▼
content-script.js
   │ window.postMessage(response, origin)
   ▼
Page receives response via protocol.ts `ping()`
```

The protocol envelope and types live in `src/core/extension/protocol.ts`
(shared) and are duplicated narrowly in `extension/src/handlers.ts` to
keep the extension bundle self-contained.

## Build

```bash
npm run build:extension
```

Output: `extension/dist/` (gitignored). Contains `manifest.json`,
`background.js`, `content-script.js`, `popup.html`, plus sourcemaps.

## Load unpacked (Chrome / Edge / Brave)

1. Run `npm run build:extension`.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `extension/dist/` directory.
6. The FeedZero icon appears in the toolbar.

## Load temporary (Firefox)

1. Run `npm run build:extension`.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `extension/dist/manifest.json`.

## Smoke test

1. Build and load the extension.
2. Start the FeedZero dev server: `npm run dev`.
3. Open `http://localhost:3000`.
4. **Ping** — in the page's devtools console:
   ```js
   const { ping } = await import("/src/core/extension/protocol.ts");
   await ping();
   ```
   Expect `{ ok: true, value: { extensionVersion: "<pkg.json version>" } }`.
   Without the extension loaded, the call resolves to `{ ok: false, error: "timeout: …" }` after 200ms — production behavior when the extension is not installed.
5. **Fetch (no permission)** — without authorizing any publisher:
   ```js
   const { fetchArticle } = await import("/src/core/extension/protocol.ts");
   await fetchArticle("https://example.com/anything");
   ```
   Expect `{ ok: false, error: "no-permission" }` — the extension refuses without an explicit host grant.
6. **Fetch (authorized)** — from the extension's popup or `chrome://extensions` → details → "Site access", grant access to a domain you have an active session for, then:
   ```js
   await fetchArticle("https://that-domain.example/article-url");
   ```
   Expect `{ ok: true, value: { html, finalUrl, status } }` with the *authenticated* HTML (not the anonymous paywall stub).

## Permissions

- `storage` — for future per-publisher allowlist persistence (Phase 2).
- `optional_host_permissions: ["https://*/*"]` — empty by default. The extension requests per-publisher access at runtime via `chrome.permissions.request` only when the user clicks "Authorize <domain>" in FeedZero's reader pane.
- No permissions to read tab content, history, or cookies. The cross-origin fetch in Phase 2 uses the browser's existing session cookies for the publisher domain, not any cookie API.

## Out of scope (Phase 1)

- Cross-origin article fetching (Phase 2).
- Paywall detection / per-publisher adapters (Phase 2).
- Per-publisher authorization UI (Phase 3).
- Chrome Web Store / Firefox AMO signing (Phase 4).
- Safari support.
