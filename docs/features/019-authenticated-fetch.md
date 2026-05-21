# Feature 019: Authenticated Full-Text Fetching via Browser Extension

## Status

**In Progress** — Phase 1 + 2 complete and on `main` once this branch merges. Phase 3+ are picked up by future sessions. Branch: `claude/find-x-account-fallback-85esB` (branch name is historical from an earlier abandoned exploration; the actual content is this feature).

| Phase | Scope | State |
|---|---|---|
| 1 | Web-app `protocol.ts` + MV3 extension scaffold + `ping` handshake | ✅ Shipped (`ade8970`, `9688f2d`) |
| 2 | `fetch-article` round-trip with cookies, permission gate, scheme guard | ✅ Shipped (`f6ff5eb`) |
| 3 | Reader-pane prompt UI, paywall detectors, `chrome.permissions.request` flow from the page | ⏳ Next |
| 4 | Settings tab listing authorized publishers; session-expired auto-refresh; Firefox parity | ⏳ |
| 5 | Chrome Web Store + Firefox AMO distribution; Safari path | ⏳ |

## Summary

FeedZero users who pay for sites like NYT / WSJ / FT / Economist can't read paywalled articles inside FeedZero today — the anonymous `/api/page` proxy gets the "Subscribe to read" stub. This feature ships a companion browser extension that fetches the article HTML using the user's existing browser session against the publisher, then posts the HTML back to FeedZero via `window.postMessage`. **Credentials never touch FeedZero's servers**; per-publisher access is authorized one domain at a time via Chrome's native host-permission prompt.

## Behaviour

```gherkin
Feature: Authenticated full-text fetching

  Scenario: User without the extension sees a paywalled article
    Given the FeedZero extension is not installed
    When the user opens a paywalled NYT article
    Then the reader pane shows the anonymous stub and an "Install extension" prompt
    And no degradation occurs for non-paywalled articles

  Scenario: First-time authorization of a publisher
    Given the FeedZero extension is installed
    And the user has an active NYT session in their browser
    And the extension has no host permissions for nytimes.com yet
    When the user opens a paywalled NYT article and clicks "Authorize nytimes.com"
    Then Chrome's native host-permission prompt appears
    And on Allow, the extension fetches the article with the user's cookies
    And the reader pane shows the full article extracted by Defuddle

  Scenario: Steady-state read after authorization
    Given the extension has been authorized for nytimes.com
    When the user opens any NYT article in FeedZero
    Then the reader pane shows the full article with an "Authenticated ✓" badge
    And FeedZero servers receive no credentials or cookies in the process

  Scenario: Session expired
    Given the user's NYT cookie has expired in their browser
    When the user opens a NYT article in FeedZero
    Then the reader pane shows "NYT session needs refreshing — open NYT to log in"
    And on returning from NYT, the article auto-reloads and renders

  Scenario: Subscription tier mismatch
    Given the user has the NYT base subscription but not Cooking
    When the user opens an NYT Cooking article
    Then the reader pane shows "This article requires a NYT Cooking subscription"
    And offers "Open on NYT.com" and "Hide Cooking articles from this feed"
```

## Architecture

### Flow

```
Page (my.feedzero.app)
   │ window.postMessage({ type: "feedzero/fetch-article", url, requestId, … })
   ▼
content-script.js   (runs in the page's world, origin-pinned)
   │ chrome.runtime.sendMessage
   ▼
background.js       (MV3 service worker)
   │ handleMessage → hasPermission(origin)? → fetch(url, credentials: "include")
   ▼ sendResponse({ type: "feedzero/fetch-article-response", ok: true, html, finalUrl, status })
content-script.js
   │ window.postMessage(response, origin)
   ▼
Page receives response via protocol.ts `fetchArticle()`
   │ Web app: paywall detector → Defuddle → reader
```

The extension is pure transport. **Paywall detection, content extraction, and rendering all stay on the web-app side** so the extension's surface stays small (currently ~3KB bundled) and the detection logic versions with the web app, not the user's local extension.

### Files

#### Web app — `src/core/extension/`

| File | Role |
|------|------|
| `src/core/extension/protocol.ts` | Message envelope types (`OutboundMessage`, `InboundMessage`), `ping()` for detection, `fetchArticle(url)` for the authenticated fetch. Origin-pinned `window.postMessage` transport with `requestId` correlation and timeout. |

#### Extension — `extension/`

| File | Role |
|------|------|
| `extension/manifest.json` | MV3. Content scripts scoped to `my.feedzero.app`, `feedzero.app`, `localhost:3000`. Permissions: `storage` only at install; `optional_host_permissions: ["https://*/*"]` reserved for per-publisher runtime grants. |
| `extension/src/background.ts` | Service worker. Thin wrapper around `handleMessage` — injects `fetchUrl` (real `fetch` with `credentials: "include"`) and `hasPermission` (`chrome.permissions.contains`). |
| `extension/src/content-script.ts` | Bridges `window.postMessage` ↔ `chrome.runtime.sendMessage`. Origin-pinned to the page's origin. Drops messages whose `type` doesn't start with `feedzero/` or ends with `-response` (avoids echo loops). |
| `extension/src/handlers.ts` | Pure message handlers. All IO (fetch, permissions) injected via `HandlerContext` so this file is fully unit-testable. The only file with logic; everything else is glue. |
| `extension/src/popup.html` | Static popup shown from the toolbar icon. Plain HTML, no React. |
| `extension/README.md` | Build, load-unpacked, and smoke-test instructions. |

#### Build

| File | Role |
|------|------|
| `scripts/build-extension.js` | esbuild bundler. Reads version from `package.json`, writes to `extension/dist/` (gitignored). Invoked via `npm run build:extension`. |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/extension/protocol.test.ts` | 9 cases: ping round-trip, ping timeout, ping requestId mismatch, ping protocol-version envelope, ping origin filter, fetchArticle success, fetchArticle failure reason forwarding, fetchArticle URL forwarded in envelope, fetchArticle timeout. Uses a `fakeExtension` helper that stands in for the content script. |
| `tests/extension/handlers.test.ts` | 10 cases: ping happy path, malformed/non-FeedZero messages rejected, response-typed messages rejected (echo-loop guard), wrong protocol version rejected, fetch happy path, no-permission short-circuit, `blocked-scheme` for `javascript:` / `data:`, network-error wraps fetch throws, malformed fetch message (no url) rejected. All IO mocked via `HandlerContext`. |

End-to-end manual smoke test in `extension/README.md`. Real-extension Playwright test (`tests/e2e/extension.spec.ts`) is Phase 3 work.

## Design decisions

- **Browser extension, not server-side credential storage.** A FeedZero-hosted "store your NYT cookies with us, encrypted" path was rejected up front — it would make FeedZero a credentials-storage target and require cookie refreshes, both of which conflict with the no-data-leaves-browser principle. The extension is the only shape that keeps credentials in the place they already live (the user's browser session) and routes the authenticated fetch through the same place.

- **Extension is pure transport.** Paywall detection lives in the web app under `src/core/extractor/paywall-detectors/` (Phase 3). Per-publisher detector logic versions with FeedZero releases — users don't need to update the extension every time NYT ships a new paywall variant. The extension itself stays small (~3KB) and rarely changes.

- **Per-publisher `optional_host_permissions`, no global access at install.** The extension manifest declares `host_permissions: []` and only `optional_host_permissions: ["https://*/*"]` as the reservoir. Each publisher is granted via `chrome.permissions.request` on user action ("Authorize nytimes.com" in the reader pane). This means: (a) the install prompt says "needs no special permissions," (b) the user retains per-domain control, (c) revoking is `chrome.permissions.remove` per domain — no need to uninstall.

- **Permission check before fetch.** The handler calls `hasPermission(origin)` before attempting the cross-origin fetch. Without this, missing host permissions would surface as an opaque network error; with it, the page gets a precise `"no-permission"` reason and can render the right "Authorize <domain>" prompt instead of a generic failure.

- **`ping()` short timeout (200ms), `fetchArticle()` long timeout (30s).** Detection runs on every reader-pane render; it must not block UI. Fetches are user-initiated and may legitimately take seconds (publisher latency + redirects).

- **Origin pin, not `event.source === window` check.** Production browsers set `event.source` correctly for self-postMessage; happy-dom does not. The origin equality check is the actual security boundary — only same-origin senders (the page itself + the content script after relaying through the background SW) can be heard. The Phase 1 commit message has the longer note.

- **Async handler with injected IO.** `handleMessage` is `async` and takes a `HandlerContext` with `fetchUrl` / `hasPermission` / `extensionVersion`. The pure handler is unit-tested without faking the entire `chrome.*` surface; the background SW provides the real implementations.

## Continuation guide (Phase 3 pickup)

A fresh session continuing this work should read:

1. This doc (`docs/features/019-authenticated-fetch.md`).
2. `docs/decisions/020-browser-extension-surface.md` for the why.
3. `src/core/extension/protocol.ts` and `extension/src/handlers.ts` — the two files that contain all the logic.
4. `extension/README.md` for the smoke-test procedure.

### Phase 3 — UX integration

Goal: the user never has to open devtools to use the feature. The reader pane detects paywalls, prompts for authorization, and re-renders the authenticated content.

Concrete deliverables:

- **`src/core/extractor/paywall-detectors/`** — new directory, mirrors `adapters/`. Exports `detectPaywall(html, url): PaywallVerdict`. First detector: `nytimes.ts`. Default detector: substring scan (`"Subscribe to read"`, `"Already a subscriber?"`, etc.) plus extracted-body-length threshold.
- **`src/stores/extension-store.ts`** — Zustand store. Holds `extensionInstalled: boolean`, `extensionVersion: string | null`, `authorizedDomains: string[]`. Action `requestPublisherAccess(domain)` calls a new protocol message `feedzero/authorize-publisher` that the extension routes to `chrome.permissions.request`.
- **`src/components/reader/paywall-prompt.tsx`** — the reader-pane UI for the four states (no-extension, authorize-publisher, session-expired, tier-not-subscribed). See Moments 1/3/6/7 in the plan file (`/root/.claude/plans/i-want-to-discuss-shimmering-peach.md`).
- **`src/stores/extraction-store.ts`** modification — `fetchExtracted(url)` runs `/api/page` first, runs paywall detection, and on `paywall` / `session-expired` either triggers `fetchArticle()` via the extension or shows the prompt.
- **New protocol message** `feedzero/authorize-publisher` — round-trips a permission grant request. Extension calls `chrome.permissions.request({ origins: [...] })` and returns the result.

### Open questions to resolve before Phase 3 starts

- **Detector copy** — exact strings for each prompt state. Should reference the 11-moment walkthrough.
- **Should the extension surface its own per-domain allowlist?** Currently `chrome.permissions.getAll()` is the source of truth; do we mirror it in `chrome.storage` for the popup display?
- **Bot-detection avoidance** — some publishers (Bloomberg, Reuters) block requests that look bot-y even with valid cookies. May need per-publisher header overrides in `fetchUrl`. Defer until we see it fail in real testing.

## Limitations

- Mobile: Chrome on Android works (limited install UX); Firefox Mobile works; iOS Safari requires a stub iOS app — deferred to v2.
- Cookie expiry is detected reactively, not proactively. We see the paywall stub and tell the user to refresh.
- Each publisher's paywall changes break the *parse*, not the fetch. Per-publisher detectors need updates twice a year (rough industry norm).
- No background prefetch — articles are extracted on-click only. Background prefetch is a post-MVP design pass; it raises rate-limit and credential-burn concerns that need their own threat-model.
- Self-hosters: the extension hardcodes `my.feedzero.app` + `feedzero.app` + `localhost:3000` as content-script origins today. A configurable FeedZero origin (per the plan) is a Phase 4 polish item.
