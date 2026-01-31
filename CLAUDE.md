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

### Data Flow

User adds feed URL → `feed-service.js` (duplicate check) → `fetch` via `/api/feed` CORS proxy → `validator.js` (RSS/Atom/JSON Feed detection) → `parser.js` (extraction) → `sanitizer.js` (DOMPurify) → `schema.js` (object creation) → `crypto.js` (AES-GCM-256 encryption) → `db.js` (Dexie/IndexedDB storage) → event bus notifies UI → auto-selects new feed.

### Core Modules

- **src/utils/result.js** — Result type (`ok`/`err`) used by all core functions instead of throwing. Check `.ok` before accessing `.value`.
- **src/utils/constants.js** — DB name, crypto params, event names. Import `EVENTS` for event bus usage.
- **src/core/events/event-bus.js** — Pub/sub with wildcard `*` support. `createEventBus()` returns `{on, off, emit, clear}`. `on()` returns an unsubscribe function.
- **src/core/storage/crypto.js** — PBKDF2 key derivation + AES-GCM encrypt/decrypt via Web Crypto API.
- **src/core/storage/db.js** — Dexie-based storage. All data encrypted at rest. Index fields (url, feedId, publishedAt) stored in plaintext for querying; content fields encrypted. Call `open(passphrase)` before any operations.
- **src/core/storage/schema.js** — `createFeed()`, `createArticle()` factory functions return Result types.
- **src/core/feeds/feed-service.js** — `addFeedFlow(url)` orchestrates: duplicate check → fetch via CORS proxy → parse → store. Returns Result.
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

### CORS Proxy

`vite.config.js` defines a dev-only Vite plugin that proxies `/api/feed?url=<encoded>` to fetch feeds server-side, bypassing browser CORS restrictions. Production will need a real proxy.

## Development Workflow

Follow this sequence for all features:

1. **PLAN** — Gherkin-style stories, minimal scope. Confirm with user before proceeding.
2. **TEST** — Write failing tests first. Run them to confirm they fail for the right reasons.
3. **CODE** — Write the minimum code to pass the tests.
4. **VERIFY** — Run full test suite, confirm no regressions.

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
