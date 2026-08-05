# Feature 019: Authenticated Full-Text Fetching via Browser Extension

## Status

**In Progress** — Phases 1, 2, and 3 complete on `main` once branch `claude/paywall-extension-feature-hR15P` merges. Phase 4+ picked up by future sessions.

| Phase | Scope | State |
|---|---|---|
| 1 | Web-app `protocol.ts` + MV3 extension scaffold + `ping` handshake | ✅ Shipped (`ade8970`, `9688f2d`) |
| 2 | `fetch-article` round-trip with cookies, permission gate, scheme guard | ✅ Shipped (`f6ff5eb`) |
| 3 | HTTP-status paywall gating, `authorize-publisher` protocol message, extension store, reader-pane prompt, extraction-store wiring | ✅ Shipped (slices on `claude/paywall-extension-feature-hR15P`) |

> **Update (ADR 028):** The content-heuristic paywall detectors (phrase lists +
> body-length thresholds, formerly `src/core/extractor/paywall-detectors/`)
> were **removed** — they false-positived on free articles (issue #211). The
> only paywall signal FeedZero now trusts is the publisher's own gated HTTP
> status (401/402/403/451) on the anonymous `/api/page` fetch. The verdict
> shape (`PaywallVerdict`) + `publisherHost()` now live in
> `src/core/extractor/paywall.ts`. The extension retry, `paywallMap`, and the
> reader-pane prompt are unchanged.
| 4 | Settings tab listing authorized publishers; session-expired auto-refresh; Firefox parity | ⏳ Next |
| 5 | Chrome Web Store + Firefox AMO distribution; Safari path | ⏳ |

### Shipping gate — `VITE_EXTENSION_ENABLED`

Paywall **gating** (by HTTP status) and the **"Open original"** fallback ship
now: a publisher that refuses the anonymous fetch (401/402/403/451) shows a
clean "Paywalled article → Open original" card instead of a broken extraction.
The **extension CTAs** (Install the FeedZero
extension, Authorize `<publisher>`, session-expired sign-in) are gated behind
`isExtensionEnabled()` (`src/core/extension/extension-enabled.ts`), which reads
`VITE_EXTENSION_ENABLED` and **defaults off**. The boot-time `detect()` ping is
gated by the same flag.

Rationale: the extension is built + unit-tested but not yet distributed (no
Chrome Web Store / AMO listing, no install page). Advertising an Install button
that 404s is worse than no button. When the extension is published, set
`VITE_EXTENSION_ENABLED=1` in the deploy environment before `npm run build:all`
to reveal the full authorize flow — no code change required.

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
   │ Web app: Defuddle → reader (re-extract; empty ⇒ session-expired)
```

The extension is pure transport. **Paywall gating, content extraction, and rendering all stay on the web-app side** so the extension's surface stays small (currently ~3KB bundled). Gating is by the publisher's HTTP status, not page content (ADR 028).

### Files

#### Web app — `src/core/extension/`

| File | Role |
|------|------|
| `src/core/extension/protocol.ts` | Message envelope types (`OutboundMessage`, `InboundMessage`), `ping()` for detection, `fetchArticle(url)` for the authenticated fetch, `authorizePublisher(domain)` for the runtime host-permission grant. Origin-pinned `window.postMessage` transport with `requestId` correlation and timeout. |

#### Web app — `src/core/extractor/paywall.ts`

| Export | Role |
|------|------|
| `PaywallVerdict` | Verdict shape recorded for a gated article (`paywalled: true`, `publisher`, `reason`). |
| `publisherHost(url)` | Canonical publisher host with leading `www.` stripped; null when unparseable. |

> The content-heuristic detectors (`paywall-detectors/`) were removed in ADR
> 028. There is no `detectPaywall(html, url)` anymore — a paywall is recognized
> only by the publisher's gated HTTP status on the anonymous fetch.

#### Web app — stores + UI

| File | Role |
|------|------|
| `src/stores/extension-store.ts` | Zustand mirror of extension presence + per-publisher grants. `status: "unknown" \| "installed" \| "absent"`, `authorizedDomains[]`, `detect()`, `requestPublisherAccess(domain)`, `isAuthorized(domain)`. |
| `src/stores/extraction-store.ts` | A gated `/api/page` status (401/402/403/451) is the paywall signal. If gated + authorized for the publisher, retries via `fetchArticle()`; a retry that still won't extract marks `session-expired`. Surfaces `paywallMap` for the reader pane. |
| `src/components/reader/paywall-prompt.tsx` | Four-state reader-pane affordance: install-extension, authorize-`<publisher>`, session-expired, fallback "Open original". |
| `src/app.tsx` (`AppInit`) | Calls `useExtensionStore.getState().detect()` once at boot so the prompt picks the right CTA without per-render pings. |

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
| `tests/core/extension/protocol.test.ts` | 13 cases: ping round-trip / timeout / requestId mismatch / protocol-version envelope / origin filter, fetchArticle success / failure-reason forwarding / URL forwarded / timeout, authorizePublisher grant / decline / domain forwarded / timeout. Uses a `fakeExtension` helper that stands in for the content script. |
| `tests/extension/handlers.test.ts` | 15 cases: ping happy path, malformed/non-FeedZero messages rejected, response-typed messages rejected (echo-loop guard), wrong protocol version rejected, fetch happy path / no-permission short-circuit / blocked-scheme / network-error wraps throws / malformed fetch (no url), authorize-publisher grant / decline / runtime throw / missing-domain / scheme-or-path domain rejected. All IO mocked via `HandlerContext`. |
| `tests/stores/extension-store.test.ts` | 8 cases: detect installed / absent / repeated calls, requestPublisherAccess grant / decline / timeout, dedupe on re-grant, isAuthorized reflection. |
| `tests/stores/extraction-store-paywall.test.ts` | A 200 response is never content-flagged (incl. #211 regressions); gated-status verdict on absent extension; authenticated retry success; session-expired when the retry won't extract; fallback verdict on extension network-error; `getPaywallVerdict` selector. |
| `tests/components/reader/paywall-prompt.test.tsx` | Install affordance, open-original fallback, authorize-button shown / disabled in-flight / clicking calls store, quiet stub during unknown probe, session-expired sign-in link, null-publisher collapse. |
| `tests/components/reader/reader-panel-paywall.test.tsx` | Prompt renders only in extracted view with a verdict; session-expired copy surfaces correctly. |

End-to-end manual smoke test in `extension/README.md`. Real-extension Playwright test (`tests/e2e/extension.spec.ts`) is Phase 4 work.

## Design decisions

- **Browser extension, not server-side credential storage.** A FeedZero-hosted "store your NYT cookies with us, encrypted" path was rejected up front — it would make FeedZero a credentials-storage target and require cookie refreshes, both of which conflict with the no-data-leaves-browser principle. The extension is the only shape that keeps credentials in the place they already live (the user's browser session) and routes the authenticated fetch through the same place.

- **Extension is pure transport.** Paywall recognition lives in the web app, keyed off the publisher's gated HTTP status (ADR 028). The earlier per-publisher content detectors were removed for being unreliable; HTTP status needs no per-publisher upkeep. The extension itself stays small (~3KB) and rarely changes.

- **Per-publisher `optional_host_permissions`, no global access at install.** The extension manifest declares `host_permissions: []` and only `optional_host_permissions: ["https://*/*"]` as the reservoir. Each publisher is granted via `chrome.permissions.request` on user action ("Authorize nytimes.com" in the reader pane). This means: (a) the install prompt says "needs no special permissions," (b) the user retains per-domain control, (c) revoking is `chrome.permissions.remove` per domain — no need to uninstall.

- **Permission check before fetch.** The handler calls `hasPermission(origin)` before attempting the cross-origin fetch. Without this, missing host permissions would surface as an opaque network error; with it, the page gets a precise `"no-permission"` reason and can render the right "Authorize <domain>" prompt instead of a generic failure.

- **`ping()` short timeout (200ms), `fetchArticle()` long timeout (30s).** Detection runs on every reader-pane render; it must not block UI. Fetches are user-initiated and may legitimately take seconds (publisher latency + redirects).

- **Origin pin, not `event.source === window` check.** Production browsers set `event.source` correctly for self-postMessage; happy-dom does not. The origin equality check is the actual security boundary — only same-origin senders (the page itself + the content script after relaying through the background SW) can be heard. The Phase 1 commit message has the longer note.

- **Async handler with injected IO.** `handleMessage` is `async` and takes a `HandlerContext` with `fetchUrl` / `hasPermission` / `extensionVersion`. The pure handler is unit-tested without faking the entire `chrome.*` surface; the background SW provides the real implementations.

## Continuation guide (Phase 4 pickup)

A fresh session continuing this work should read:

1. This doc (`docs/features/019-authenticated-fetch.md`).
2. `docs/decisions/020-browser-extension-surface.md` for the why.
3. `src/core/extension/protocol.ts` and `extension/src/handlers.ts` — page <-> extension wire format.
4. `src/stores/extraction-store.ts` — gated-status recognition + retry orchestration.
5. `src/stores/extension-store.ts` — extension presence + per-publisher grants.
6. `src/components/reader/paywall-prompt.tsx` — the four-state UI.
7. `extension/README.md` for the smoke-test procedure.

### Phase 4 — polish + settings + Firefox

- **Settings tab listing authorized publishers** — read from `useExtensionStore.authorizedDomains` + a per-domain "Revoke" button that calls a new `feedzero/revoke-publisher` protocol message routing to `chrome.permissions.remove`. Mirror in chrome.storage so the popup can render the same list when the page is not open.
- **Session-expired auto-refresh** — when the user clicks "Open `<publisher>` to sign in", the reader pane could subscribe to `visibilitychange` and auto-retry the fetch on tab return. Today the user must manually toggle "Full text" off and on again.
- **Firefox parity** — Firefox's MV3 differs from Chrome's in `optional_host_permissions` semantics. Verify the install / authorize flow on Firefox Beta; document any divergence in `extension/README.md`.
- **Additional publishers** — at minimum WSJ, FT, Economist, Bloomberg, Atlantic, New Yorker. With content detectors gone (ADR 028), "supporting" a publisher is mostly verifying its anonymous fetch returns a gated status and that the authenticated retry extracts. Take care with Bloomberg (anti-bot CAPTCHA) — may need per-publisher header overrides on the extension's `fetchUrl`.
- **Real-extension Playwright test** — `tests/e2e/extension.spec.ts`. Boot Chromium with `--load-extension=extension/dist`, open the reader on a fixture NYT page, click "Authorize", assert the prompt disappears and Defuddle output renders. Will need a stub HTTP endpoint that serves both the paywalled and authenticated variants based on a cookie.

### Open questions for Phase 4

- **Where should the install link point?** Currently `https://feedzero.app/extension` (placeholder). Needs a real marketing/install page (or direct Chrome Web Store link once published).
- **Should the popup mirror per-domain state?** Currently `chrome.permissions.getAll()` is the source of truth; we mirror in `useExtensionStore.authorizedDomains` for the page but not in `chrome.storage` for the popup. Decide before shipping Phase 4 settings UI.
- **Bot-detection avoidance** — some publishers (Bloomberg, Reuters) block requests that look bot-y even with valid cookies. May need per-publisher header overrides in `fetchUrl`. Defer until we see it fail in real testing.
- **Honor-system extension trust** — anything in the extension can read all the user's cookies for granted publishers. Document the implicit trust boundary in `extension/README.md` so users understand they are choosing to run our code in a high-trust context, even though it never leaves the browser.

## Limitations

- Mobile: Chrome on Android works (limited install UX); Firefox Mobile works; iOS Safari requires a stub iOS app — deferred to v2.
- Cookie expiry is detected reactively, not proactively. We see the paywall stub and tell the user to refresh.
- Gating now keys off the publisher's HTTP status, not page content, so a publisher restyling its paywall HTML no longer breaks recognition. A publisher that serves a 200 stub instead of a gated status will read as an empty extraction (plain failure), not a paywall prompt — an accepted trade-off for dropping the false-positive-prone content heuristics (ADR 028).
- No background prefetch — articles are extracted on-click only. Background prefetch is a post-MVP design pass; it raises rate-limit and credential-burn concerns that need their own threat-model.
- Self-hosters: the extension hardcodes `my.feedzero.app` + `feedzero.app` + `localhost:3000` as content-script origins today. A configurable FeedZero origin (per the plan) is a Phase 4 polish item.
