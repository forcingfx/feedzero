# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm test              # Run all unit/integration tests (Vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run with V8 coverage (90% threshold enforced)
npm run test:e2e      # Run Playwright E2E tests
npm run dev           # Dev server on http://localhost:3000
```

Run a single test file: `npx vitest run tests/core/parser/parser.test.js`

## Architecture

FeedZero is a privacy-first RSS reader. Vanilla JS (ES modules), Web Components, with targeted library use for security-critical code.

### Runtime Dependencies

- **DOMPurify** — HTML sanitization (XSS protection). Do not hand-roll sanitizers.
- **Dexie.js** — IndexedDB wrapper with query API. Used in `db.js` for encrypted storage.
- **Defuddle** — Full-text extraction from web pages (browser bundle, zero deps). Used in `defuddle-extractor.js`. Pluggable — can be swapped for Readability or other extractors.

### Data Flow

User adds feed URL → `feed-service.js` (duplicate check) → `fetch` via `/api/feed` CORS proxy → `validator.js` (RSS/Atom/JSON Feed detection) → `parser.js` (extraction) → `extractor.js` (full-text extraction for summary-only articles via `/api/page`) → `sanitizer.js` (DOMPurify) → `schema.js` (object creation) → `crypto.js` (AES-GCM-256 encryption) → `db.js` (Dexie/IndexedDB storage) → event bus notifies UI → auto-selects new feed.

### Core Modules

- **src/utils/result.js** — Result type (`ok`/`err`) used by all core functions instead of throwing. Check `.ok` before accessing `.value`.
- **src/utils/constants.js** — DB name, crypto params, event names. Import `EVENTS` for event bus usage.
- **src/core/events/event-bus.js** — Pub/sub with wildcard `*` support. `createEventBus()` returns `{on, off, emit, clear}`. `on()` returns an unsubscribe function.
- **src/core/storage/crypto.js** — PBKDF2 key derivation + AES-GCM encrypt/decrypt via Web Crypto API.
- **src/core/storage/db.js** — Dexie-based storage. All data encrypted at rest. Index fields (url, feedId, publishedAt) stored in plaintext for querying; content fields encrypted. Call `open(passphrase)` before any operations.
- **src/core/storage/schema.js** — `createFeed()`, `createArticle()` factory functions return Result types.
- **src/core/discovery/discovery.js** — `discoverFeed(url)` runs a multi-strategy cascade to find a feed from a website URL: HTML `<link>` autodiscovery → well-known paths → anchor scanning.
- **src/core/discovery/strategies.js** — Pure functions for each discovery strategy: `findFeedLinksInHtml()`, `getWellKnownFeedUrls()`, `findFeedLinksInAnchors()`.
- **src/core/extractor/extractor.js** — Public API: `extract(html, url)` and `needsExtraction(article)`. Delegates to active extractor implementation.
- **src/core/extractor/defuddle-extractor.js** — Defuddle-based extraction. Swap this import in `extractor.js` to use a different library.
- **src/core/feeds/feed-service.js** — `addFeedFlow(url)` orchestrates: normalize URL → duplicate check → fetch → parse (on failure: discover feed) → extract full text → store. `normalizeUrl()` handles bare domains, missing scheme, trailing slashes.
- **src/core/parser/parser.js** — `parse(text, feedUrl)` handles RSS 2.0, Atom 1.0, and JSON Feed 1.1. Returns `{feed, articles}`.
- **src/core/parser/sanitizer.js** — DOMPurify wrapper with allowlisted tags/attrs. Links get `rel="noopener noreferrer"` automatically.
- **src/main.js** — App entry point. Only module that wires components together via event bus.

### UI Components (Web Components)

`<feed-list>`, `<article-list>`, `<article-view>` — set `.eventBus` property to connect. `keyboard-nav.js` manages j/k/Enter/Escape navigation.

### Testing

- Vitest with happy-dom environment. `fake-indexeddb` needed for db.js tests.
- Test files mirror source structure under `tests/`.
- Coverage threshold: 90% branches/functions/lines/statements.
- Note: DOMPurify + happy-dom will execute inline scripts during sanitization. Use non-callable code in test fixtures (e.g., `var x = 1;` not `alert(1)`).
- **happy-dom DOM fidelity gaps:** happy-dom's DOMParser does not behave identically to browser DOMParser. Known differences:
  - `querySelector` with CSS-escaped colons (e.g. `content\\:encoded`) may work in happy-dom but fail in browsers. Always use `getElementsByTagName` for XML namespace-prefixed elements.
  - `CDATA` sections in XML with namespace declarations may fail to parse. Use entity-escaped HTML (`&lt;p&gt;`) instead of `<![CDATA[<p>]]>` in test fixtures.
  - When writing parser tests, always include fixtures with real RSS namespace prefixes (`content:encoded`, `dc:creator`) to catch selector issues that only manifest in browsers.

### CORS Proxy

`vite.config.js` defines a dev-only Vite plugin that proxies `/api/feed?url=<encoded>` to fetch feeds server-side, bypassing browser CORS restrictions. Production will need a real proxy.

## Development Workflow

Follow this sequence for all features:

1. **PLAN** — Gherkin-style stories, minimal scope. Confirm with user before proceeding.
2. **TEST** — Write failing tests first. Run them to confirm they fail for the right reasons.
3. **CODE** — Write the minimum code to pass the tests. Add JSDoc to all public functions. Add inline comments where intent or "why" is not obvious from the code itself. Do not comment the obvious.
4. **VERIFY** — Run full test suite, confirm no regressions.
5. **DOCUMENT** — Review the `docs/` folder. Update `docs/architecture.md`, `docs/data-schema.md`, and relevant feature docs in `docs/features/` to reflect what changed. Create a new feature doc from `docs/features/TEMPLATE.md` for any new feature. Update ADRs in `docs/decisions/` if architectural decisions were made.

## Commit Messages

Write detailed commit messages. Use conventional commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).

**For features:** Summarize what was added and why. List key files created or modified.

**For bug fixes:** The commit body must include four sections:
1. **What** — What the bug was (observable symptom)
2. **Why** — Why it occurred (root cause)
3. **Fix** — How it was fixed (what changed)
4. **Prevention** — What preventive measures were added (tests, docs, lint rules)

Example:
```
fix: use getElementsByTagName for namespaced XML elements

What: Full article content was silently dropped — only the short
<description> was displayed instead of <content:encoded>.

Why: querySelector fails with namespace-prefixed tags like
content:encoded because the colon is interpreted as a CSS
pseudo-class separator. happy-dom (test env) handled it
differently, masking the bug.

Fix: Switched text() helper from querySelector to
getElementsByTagName, which takes the literal tag name
including namespace prefix.

Prevention: Added regression tests with namespaced RSS fixtures
(content:encoded, dc:creator). Documented happy-dom DOM fidelity
gaps in CLAUDE.md.
```

## Principles

- **Security first** — Encrypt at rest, sanitize all external content, never trust user or feed input. Use production-grade libraries (DOMPurify, Web Crypto) over hand-rolled implementations.
- **Privacy and anonymity** — No telemetry, no analytics, no external calls except explicit user actions (fetching feeds). No data leaves the browser unless the user initiates it.
- **Open source first** — Prefer actively maintained OSS libraries where they reduce code and improve correctness. Do not reimplement what a well-maintained library handles better. Evaluate libraries by: active maintenance, small footprint, browser compatibility.
- **Minimal but clear** — Write the least code that solves the problem. No speculative features, no premature abstractions, no dead code. Three similar lines are better than a premature helper. Delete code that has no callers.
- **Clean code** — Self-evident naming, small functions, explicit error handling via Result types. Comments only where the logic is non-obvious.

### Key Patterns

- All core functions return Result types — never throw for expected errors
- Components communicate only through the event bus — no direct references
- IndexedDB records store encrypted content + plaintext index fields for Dexie queries
- Sanitization delegated to DOMPurify — do not bypass or hand-roll
- Feed format detection tries JSON parse first (for JSON Feed), then XML (for RSS/Atom)
- XML namespace-prefixed elements (`content:encoded`, `dc:creator`) must use `getElementsByTagName`, never `querySelector` — CSS selectors cannot reliably handle namespace colons
