# FeedZero browser extension

This extension lets you read your paid subscriptions inside FeedZero by
fetching article HTML using the cookies already in your browser. Credentials
never touch FeedZero's servers — every authenticated fetch happens locally,
authorized per-publisher.

Status: Phases 1 (ping handshake), 2 (authenticated `fetch-article`), and 3 (paywall detection + reader-pane authorize prompt + extraction-store wiring) are implemented. The reader pane now detects paywalled articles automatically, prompts you to authorize the publisher, and re-renders the authenticated content. Phase 4 (settings tab listing authorized publishers, additional publishers, Chrome Web Store distribution) is in progress.

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

## Smoke test (end-to-end, what a real user does)

1. Build the extension: `npm run build:extension`.
2. Load it in Chrome (see "Load unpacked" above).
3. Start the FeedZero dev server: `npm run dev`.
4. Open `http://localhost:3000` and add a feed from a publisher you have a paid subscription to — e.g. `https://www.economist.com/the-world-this-week/rss.xml` if you subscribe to The Economist, or NYT's RSS for an NYT subscriber.
5. Click a paywalled article in the list, then click the **Full text** toggle in the reader pane.
6. The reader pane should show the paywall affordance — title "Paywalled article", subtitle naming the publisher, and an **"Authorize economist.com"** (or nytimes.com) button. The "Open original" outline button is always present as a fallback.
7. Click **"Authorize economist.com"**. Chrome's native host-permission dialog appears asking for access to `https://economist.com/*`. Click **Allow**.
8. Toggle **Full text** off and on again (the auto-retry after a fresh grant is Phase 4). The reader pane should now show the *authenticated* article body — not the paywall stub.

## Devtools-driven smoke test (lower-level)

If you want to drive each step manually instead of through the UI:

1. **Ping**
   ```js
   const { ping } = await import("/src/core/extension/protocol.ts");
   await ping();
   ```
   Expect `{ ok: true, value: { extensionVersion: "<pkg.json version>" } }`. With the extension unloaded the call resolves to `{ ok: false, error: "timeout: …" }` after 200ms.
2. **Fetch without permission**
   ```js
   const { fetchArticle } = await import("/src/core/extension/protocol.ts");
   await fetchArticle("https://www.economist.com/anything");
   ```
   Expect `{ ok: false, error: "no-permission" }`.
3. **Authorize the publisher via the protocol**
   ```js
   const { authorizePublisher } = await import("/src/core/extension/protocol.ts");
   await authorizePublisher("economist.com");
   ```
   Chrome shows the host-permission dialog; clicking Allow returns `{ ok: true, value: { granted: true } }`.
4. **Fetch with permission** — same call as step 2 now resolves to `{ ok: true, value: { html, finalUrl, status } }` with the authenticated HTML body.

## Permissions

- `storage` — for future per-publisher allowlist persistence (Phase 2).
- `optional_host_permissions: ["https://*/*"]` — empty by default. The extension requests per-publisher access at runtime via `chrome.permissions.request` only when the user clicks "Authorize <domain>" in FeedZero's reader pane.
- No permissions to read tab content, history, or cookies. The cross-origin fetch in Phase 2 uses the browser's existing session cookies for the publisher domain, not any cookie API.

## Out of scope (current)

- Settings tab listing authorized publishers + per-domain revoke (Phase 4).
- Session-expired auto-refresh on tab return (Phase 4).
- Chrome Web Store / Firefox AMO signed distribution (Phase 5).
- Safari support (Phase 5+).
