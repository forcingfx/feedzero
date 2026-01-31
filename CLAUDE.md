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

User adds feed URL → `fetch` → `validator.js` (RSS/Atom detection) → `parser.js` (extraction) → `sanitizer.js` (DOMPurify) → `schema.js` (object creation) → `crypto.js` (AES-GCM-256 encryption) → `db.js` (Dexie/IndexedDB storage) → event bus notifies UI components.

### Core Modules

- **src/utils/result.js** — Result type (`ok`/`err`) used by all core functions instead of throwing. Check `.ok` before accessing `.value`.
- **src/utils/constants.js** — DB name, crypto params, event names. Import `EVENTS` for event bus usage.
- **src/core/events/event-bus.js** — Pub/sub with wildcard `*` support. `createEventBus()` returns `{on, off, emit, clear}`. `on()` returns an unsubscribe function.
- **src/core/storage/crypto.js** — PBKDF2 key derivation + AES-GCM encrypt/decrypt via Web Crypto API.
- **src/core/storage/db.js** — Dexie-based storage. All data encrypted at rest. Index fields (url, feedId, publishedAt) stored in plaintext for querying; content fields encrypted. Call `open(passphrase)` before any operations.
- **src/core/storage/schema.js** — `createFeed()`, `createArticle()` factory functions return Result types.
- **src/core/parser/parser.js** — `parse(xml, feedUrl)` handles RSS 2.0 + Atom 1.0, returns `{feed, articles}`.
- **src/core/parser/sanitizer.js** — DOMPurify wrapper with allowlisted tags/attrs. Links get `rel="noopener noreferrer"` automatically.
- **src/main.js** — App entry point. Only module that wires components together via event bus.

### UI Components (Web Components)

`<feed-list>`, `<article-list>`, `<article-view>` — set `.eventBus` property to connect. `keyboard-nav.js` manages j/k/Enter/Escape navigation.

### Testing

- Vitest with happy-dom environment. `fake-indexeddb` needed for db.js tests.
- Test files mirror source structure under `tests/`.
- Coverage threshold: 90% branches/functions/lines/statements.
- Note: DOMPurify + happy-dom will execute inline scripts during sanitization. Use non-callable code in test fixtures (e.g., `var x = 1;` not `alert(1)`).

### Key Patterns

- All core functions return Result types — never throw for expected errors
- Components communicate only through the event bus — no direct references
- IndexedDB records store encrypted content + plaintext index fields for Dexie queries
- Sanitization delegated to DOMPurify — do not bypass or hand-roll
