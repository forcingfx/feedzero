# ADR 020: Browser Extension as the Surface for Authenticated Content Fetching

## Status

Accepted (2026-05-21).

## Context

Many FeedZero users pay for sites that paywall their full content — NYT, WSJ, FT, Economist, New Yorker, Atlantic. Today, FeedZero's `/api/page` proxy fetches anonymously: paying users still see "Subscribe to read" stubs in their reader pane even though the article is available to them in their normal browser.

The user's credentials for those publishers exist in exactly one place: their browser, as cookies scoped to the publisher's origin. To fetch the full article on the user's behalf, we need to make a request that carries those cookies. The CORS Same-Origin Policy prevents the FeedZero web app from doing this directly (`fetch("https://nytimes.com/...", { credentials: "include" })` is blocked by the browser because nytimes.com does not send `Access-Control-Allow-Origin: feedzero.app` — and never will).

So the question becomes: where do we put the code that performs the authenticated fetch?

### Alternatives considered

**(a) Store user-pasted session cookies on FeedZero's servers, encrypted.**
- User logs into nytimes.com in their browser, copies cookies via devtools, pastes into a FeedZero settings field.
- FeedZero encrypts and stores them; the `/api/page` proxy sends them on subsequent fetches.
- **Rejected.** Makes FeedZero a credentials-storage product, attractive target for breach. Cookies expire constantly (NYT every ~6 months, others vary), creating endless user maintenance. Violates the principle that "no data leaves the browser unless the user initiates it" — the user does not initiate every refresh fetch.

**(b) Store username + password, log in headlessly on user's behalf.**
- FeedZero servers run a Playwright/Puppeteer instance, log in with user-supplied credentials, scrape the article.
- **Rejected for the same reasons as (a), with the additional cost of raw-password storage and bot-detection by publishers.** Publishers' ToS explicitly prohibit this.

**(c) Bookmarklet.**
- User adds a bookmarklet. When stuck on a paywalled article, they click it → it opens the original URL in a popup (same-origin to publisher, cookies present) → an injected snippet posts the article HTML back via `window.postMessage`.
- **Rejected as v1** because (i) modern publisher CSPs block `javascript:` bookmarklets on a meaningful fraction of sites, (ii) per-article-click UX is intrusive, (iii) no background path possible. Worth revisiting as a fallback for users who won't install an extension; see Feature 019 limitations.

**(d) Iframe the publisher's page inside FeedZero's reader pane.**
- Investigated and rejected because every major paywall publisher sets `X-Frame-Options: DENY` or `CSP: frame-ancestors 'none'`. Browsers refuse to render. Even if they didn't, the Same-Origin Policy means FeedZero couldn't read the iframe's content for clean extraction.

**(e) Self-hosted headless-browser side-car.**
- Self-hosters could run a Playwright instance with a persistent browser profile they've manually logged in to. The `/api/page` proxy delegates to it for configured domains.
- **Accepted as a future path** but it only serves self-hosters; the hosted-SaaS majority gets nothing. Documented as a Phase 5+ option.

**(f) Browser extension.**
- A FeedZero-branded MV3 extension is granted host permissions for the user's chosen publisher domains. When FeedZero's reader pane shows a paywalled article, it asks the extension via `window.postMessage` to fetch the original URL. The extension does a same-origin fetch from its background service worker — cookies present, paywall passes, full HTML returned via the bridge.
- **Accepted.**

### Why the extension wins

- **Credentials live where they already live.** The extension uses cookies the browser already holds for the publisher origin. No password, cookie value, or session token ever exists outside the user's browser. FeedZero servers see nothing.
- **Per-publisher consent.** `optional_host_permissions` makes each publisher an explicit opt-in via the browser's own native permission prompt — not a FeedZero confirmation we built and could get wrong.
- **No FeedZero server in the credential path.** Aligns with the project's core privacy principle ("no data leaves the browser unless the user initiates it") in a way (a) and (b) cannot.
- **Existing precedent.** This is exactly the shape of mature reader-app extensions (Readwise Reader, Pocket's archive extension, Mercury's Postlight Parser). The pattern is well understood by users.
- **Maintenance scoped to detection, not transport.** Per-publisher paywall detection lives in the web app (`src/core/extractor/paywall-detectors/`) and ships with FeedZero releases. The extension itself is ~3KB of pure transport and rarely changes — users don't need to update it when NYT ships a new paywall variant.

### Trade-offs accepted

- **New distribution surface.** Chrome Web Store + Firefox AMO submissions, web-store reviews, MV3 quirks, periodic re-signing. Real maintenance cost; small but ongoing.
- **No mobile parity in v1.** Chrome on Android works; iOS Safari requires a stub iOS app — deferred.
- **Per-publisher detection drift.** Publishers change paywall HTML twice a year on average. Each change requires updating that publisher's detector. This is the unavoidable cost of any feature that depends on third-party HTML.
- **Cookie expiry is reactive.** We can't refresh cookies; we surface "session expired" prompts and route the user to the publisher to log in again.

## Decision

FeedZero ships a companion MV3 browser extension as the surface for authenticated full-text fetching. It acts as pure transport: the web app asks for a URL, the extension returns the raw HTML using the user's existing session, and paywall detection + content extraction stay on the web-app side.

The extension is purely additive — non-extension users experience no degradation. Articles that are free continue to work via `/api/page` as before; paywalled articles get a "Install the FeedZero extension" prompt with "Open original" as the fallback path.

## Consequences

### Required

- `extension/` directory in the repo with its own MV3 manifest and esbuild pipeline (`scripts/build-extension.js`, `npm run build:extension`, output to `extension/dist/` — gitignored).
- Web-app protocol module (`src/core/extension/protocol.ts`) — `ping()` for detection, `fetchArticle(url)` for the authenticated fetch. Both return `Result<...>`.
- Pure extension handler (`extension/src/handlers.ts`) with all IO injected via `HandlerContext`, so unit tests don't need to fake `chrome.*` APIs.
- Per-publisher paywall detectors under `src/core/extractor/paywall-detectors/` (Phase 3).

### Forbidden

- **No server-side credential storage. Ever.** If a future feature ever proposes "let users paste their cookies into a FeedZero settings field, encrypted at rest," it must come with an ADR superseding this one.
- **No global `host_permissions` at install.** The manifest must declare `host_permissions: []` and rely on `optional_host_permissions` + `chrome.permissions.request` for per-domain grants. The install prompt should always say "needs no special permissions."
- **No telemetry from the extension.** No anonymous usage stats, no per-publisher fetch counts reported anywhere outside the user's own browser. The extension is local-only by design.
- **Extension scope is transport only.** Paywall detection, content extraction, rendering, and caching stay on the web-app side. Resist any feature that pulls publisher-specific HTML knowledge into the extension — it inverts the maintenance model and forces users to update the extension every time a publisher changes its layout.

### Affects

- `docs/features/019-authenticated-fetch.md` — the feature doc with status, behaviour, files, tests, continuation guide.
- Future ADRs covering distribution (Chrome Web Store signing, etc.) when those decisions are made.

## References

- Feature 019 (`docs/features/019-authenticated-fetch.md`).
- Commits `ade8970`, `9688f2d`, `f6ff5eb` on `claude/find-x-account-fallback-85esB`.
