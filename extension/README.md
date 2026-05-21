# FeedZero browser extension

This extension lets you read your paid subscriptions inside FeedZero by
fetching article HTML using the cookies already in your browser. Credentials
never touch FeedZero's servers — every authenticated fetch happens locally,
authorized per-publisher.

This is Phase 1 — only the `ping` handshake with the web app is implemented.
The authenticated fetch path lands in Phase 2 alongside paywall detection.

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
4. In the page's devtools console, run:
   ```js
   const { ping } = await import("/src/core/extension/protocol.ts");
   await ping();
   ```
5. Expect `{ ok: true, value: { extensionVersion: "<pkg.json version>" } }`.

Without the extension loaded, the same call resolves to `{ ok: false, error: "timeout: …" }` after 200ms — which is the production behavior when the extension is not installed.

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
