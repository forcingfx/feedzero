# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠ Mandatory: Red-Green-Refactor

**Every code change in this project MUST follow the Red-Green-Refactor (RGR) cycle. No exceptions.**

1. Write a failing test BEFORE writing any production code
2. Write the minimum code to make the test pass
3. Refactor the code you wrote and touched — this step is NOT optional

**Do not write production code without a failing test. Do not skip refactoring. Do not combine these steps.** If a task has no testable behavior (e.g., config changes, docs), the refactor step still applies to any code you touch. See [Development Workflow](#development-workflow) for the full sequence.

## Build & Test Commands

```bash
npm test              # Run all unit/integration tests (Vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run with V8 coverage (90% threshold enforced)
npm run test:e2e      # Run Playwright E2E tests
npm run dev           # Dev server on http://localhost:3000
npx tsc --noEmit      # TypeScript type check (strict mode)
```

Run a single test file: `npx vitest run tests/core/parser/parser.test.js`

## Architecture

FeedZero is a privacy-first RSS reader. React + TypeScript UI with Zustand state management, React Router for navigation, and Tailwind CSS v4 for styling. Core modules (`src/core/`, `src/utils/`) are framework-agnostic TypeScript — they have zero React/UI imports and serve as the shared backend.

### Runtime Dependencies

- **React + React DOM** — UI framework (functional components, hooks)
- **Zustand** — State management (1.2kB, works outside React too). Stores call core modules directly.
- **React Router** — URL-based routing with responsive layout (mobile single-panel, desktop 3-panel)
- **DOMPurify** — HTML sanitization (XSS protection). Do not hand-roll sanitizers.
- **Dexie.js** — IndexedDB wrapper with query API. Used in `db.ts` for encrypted storage.
- **Defuddle** — Full-text extraction from web pages (browser bundle, zero deps). Pluggable — can be swapped for Readability or other extractors.
- **clsx + tailwind-merge** — Tailwind class merging via `cn()` utility.

### Data Flow

User adds feed URL → `feed-service.ts` (normalize URL, duplicate check) → `fetch` via `/api/feed` CORS proxy → `validator.ts` (RSS/Atom/JSON Feed detection) → `parser.ts` (extraction) → `sanitizer.ts` (DOMPurify) → `schema.ts` (object creation with guid) → `crypto.ts` (AES-GCM-256 encryption) → `db.ts` (Dexie/IndexedDB storage) → Zustand store updates → React re-renders → auto-selects new feed via URL navigation.

Full-text extraction is user-initiated: in reader panel, click "Extracted" → fetch via `/api/page` → `extractor.ts` → `defuddle-extractor.ts` (Defuddle parse → `cleanup.ts` → DOMPurify sanitize) → cached in extraction store and displayed.

### Core Modules (Framework-Agnostic TypeScript)

- **src/utils/result.ts** — Generic `Result<T>` type (`ok`/`err`) used by all core functions instead of throwing. Check `.ok` before accessing `.value`.
- **src/utils/constants.ts** — DB name, crypto params, event names (legacy, being phased out).
- **src/core/events/event-bus.ts** — Pub/sub with wildcard `*` support. Legacy — being replaced by Zustand stores. Still used by integration tests.
- **src/core/storage/crypto.ts** — PBKDF2 key derivation + AES-GCM encrypt/decrypt via Web Crypto API.
- **src/core/storage/db.ts** — Dexie-based storage. All data encrypted at rest. Index fields (url, feedId, publishedAt) stored in plaintext for querying; content fields encrypted. Call `open(passphrase)` before any operations.
- **src/core/storage/schema.ts** — `createFeed()`, `createArticle()` factory functions return Result types.
- **src/core/discovery/discovery.ts** — `discoverFeed(url)` runs a multi-strategy cascade to find a feed from a website URL.
- **src/core/discovery/strategies.ts** — Pure functions for each discovery strategy.
- **src/core/extractor/extractor.ts** — Public API: `extract(html, url)` and `needsExtraction(article)`. Delegates to active extractor implementation.
- **src/core/extractor/defuddle-extractor.ts** — Defuddle-based extraction. Swap this import in `extractor.ts` to use a different library.
- **src/core/extractor/cleanup.ts** — `cleanExtractedContent(html)` removes empty elements, collapses consecutive `<br>` tags.
- **src/core/feeds/feed-service.ts** — `addFeedFlow(url)` orchestrates the full add-feed flow. `refreshFeed(feed)` and `refreshAllFeeds()` handle feed refresh with guid-based dedup.
- **src/core/parser/parser.ts** — `parse(text, feedUrl)` handles RSS 2.0, Atom 1.0, and JSON Feed 1.1.
- **src/core/parser/sanitizer.ts** — DOMPurify wrapper with allowlisted tags/attrs.

### Zustand Stores

- **src/stores/app-store.ts** — DB initialization, global error state. `initialize(passphrase)` opens the database.
- **src/stores/feed-store.ts** — `feeds[]`, `selectedFeedId`, CRUD actions. Actions call core modules directly (`addFeedFlow`, `refreshAllFeeds`, etc.).
- **src/stores/article-store.ts** — `articles[]`, `selectedArticle`, `loadArticles(feedId)`, `selectArticle(article)` (auto-marks as read).
- **src/stores/extraction-store.ts** — `cache` (link → extracted HTML), `viewMode`, `fetchExtracted(url)`. Extraction is on-demand and cached.

### React Components

- **src/components/layout/** — `header.tsx`, `panel.tsx` (layout primitives)
- **src/components/feeds/** — `feed-list.tsx`, `feed-item.tsx`, `add-feed-form.tsx`
- **src/components/articles/** — `article-list.tsx`, `article-item.tsx`
- **src/components/reader/** — `reader-panel.tsx`, `view-toggle.tsx`, `article-content.tsx`
- **src/pages/feeds-page.tsx** — Main page component. Desktop: 3-panel CSS grid. Mobile: single panel with back navigation. Syncs URL params to Zustand stores.
- **src/ui/components/content-modes.ts** — Pure functions for content view modes (Feed/Extracted visibility, summary subheading detection, similarity/completeness heuristics). Used by `reader-panel.tsx`.

### Routing

```
/feeds                                → Feed list (mobile: full screen)
/feeds/:feedId                        → Article list (mobile: full screen, desktop: panels 1+2)
/feeds/:feedId/articles/:articleId    → Reader (mobile: full screen, desktop: all 3 panels)
```

URL is the source of truth for navigation state. `FeedsPage` syncs URL params to Zustand stores.

### Hooks

- **src/hooks/use-keyboard-nav.ts** — j/k/Enter/Escape navigation. Queries `[role="option"]` elements in the DOM.
- **src/hooks/use-media-query.ts** — Responsive breakpoint detection. `useIsDesktop()` for ≥1024px.

### Styling

Single CSS entry point: `src/index.css`. Tailwind CSS v4 via `@tailwindcss/vite` (zero runtime cost).

- **`@theme`** — Design tokens (colors, fonts, radius). Use `--color-*`, `--font-*` tokens.
- **`@layer base`** — Global resets, layout grid (`grid-template-columns: 250px 300px 1fr`), button/input base styles.
- **Tailwind utilities** — Used in JSX `className` props. Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **Spacing** — Use Tailwind v4's default numeric spacing scale (`p-4`, `gap-2`, `mb-6`, etc.). Do **not** define custom `--spacing-xs/sm/md/lg/xl` tokens in `@theme` — these collide with Tailwind v4's `max-w-*` utilities (e.g., `max-w-lg` resolves to `--spacing-lg` instead of `--container-lg`). This is a [known Tailwind v4 gotcha](https://github.com/tailwindlabs/tailwindcss/discussions/17777).

### Types

- **src/types/index.ts** — Core domain interfaces: `Feed`, `Article`, `CreateFeedInput`, `CreateArticleInput`.

### Service Worker

`src/workers/service-worker.js` — Excluded from test coverage. Located under `src/workers/`.

### Testing

- Vitest with happy-dom environment. `fake-indexeddb` needed for db.ts tests.
- React Testing Library + userEvent for component tests. Setup file: `tests/setup.ts`.
- Store tests use Zustand's `getState()`/`setState()` directly — no React rendering needed.
- Test files mirror source structure under `tests/`.
- Coverage threshold: 90% branches/functions/lines/statements. `src/workers/**` excluded from coverage.
- E2E tests (Playwright): test dir is `tests/e2e/`, runs on port 3001 (separate from dev server on 3000).
- Note: DOMPurify + happy-dom will execute inline scripts during sanitization. Use non-callable code in test fixtures (e.g., `var x = 1;` not `alert(1)`).
- **happy-dom DOM fidelity gaps:** happy-dom's DOMParser does not behave identically to browser DOMParser. Known differences:
  - `querySelector` with CSS-escaped colons (e.g. `content\\:encoded`) may work in happy-dom but fail in browsers. Always use `getElementsByTagName` for XML namespace-prefixed elements.
  - `CDATA` sections in XML with namespace declarations may fail to parse. Use entity-escaped HTML (`&lt;p&gt;`) instead of `<![CDATA[<p>]]>` in test fixtures.
  - When writing parser tests, always include fixtures with real RSS namespace prefixes (`content:encoded`, `dc:creator`) to catch selector issues that only manifest in browsers.

### CORS Proxy

`vite.config.js` defines a dev-only Vite plugin that proxies `/api/feed?url=<encoded>` and `/api/page?url=<encoded>` to fetch feeds/pages server-side, bypassing browser CORS restrictions. Production will need a real proxy.

**SSRF protections** — The proxy blocks requests to internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16–31.x, 192.168.x, 169.254.169.254) and only allows `http:`/`https:` protocols. Do not weaken these checks.

## Development Workflow

This project follows **Red-Green-Refactor (RGR)** — the TDD cycle where you write a failing test (red), make it pass with minimal code (green), then clean up (refactor). Every feature follows this exact sequence. **No step may be skipped or reordered.**

1. **PLAN** — Gherkin-style stories, minimal scope. Confirm with user before proceeding.

2. **RED** — Write failing tests first. Run them. They MUST fail. If they pass, the test is wrong — fix it before proceeding.
   - ⛔ **STOP: Do not write any production code until you have a failing test.**

3. **GREEN** — Write the minimum code to make the tests pass. Nothing more. Add JSDoc to all public functions. Add inline comments where intent or "why" is not obvious from the code itself. Do not comment the obvious.
   - ⛔ **STOP: Do not refactor yet. First verify all tests pass.**

4. **VERIFY** — Run full test suite (`npm test`) AND type check (`npx tsc --noEmit`). Confirm zero failures, zero regressions, zero type errors.
   - ⛔ **STOP: Do not proceed if any test fails or types error. Fix first.**

5. **REFACTOR** — This step is **mandatory, not optional**. Clean up the code you wrote and touched:
   - Extract unclear blocks into well-named functions
   - Remove duplication (DRY, but not at the cost of clarity)
   - Ensure each function does one thing (Single Responsibility)
   - Use intention-revealing names for variables, functions, and parameters
   - Keep functions short — if a function needs a comment to explain what it does, extract and name it instead
   - Apply the Boy Scout Rule: leave every file you touched cleaner than you found it
   - ⛔ **STOP: Re-run `npm test` after refactoring. All tests must still pass.**

6. **DOCUMENT** — Review the `docs/` folder. Update `docs/architecture.md`, `docs/data-schema.md`, and relevant feature docs in `docs/features/` to reflect what changed. Create a new feature doc from `docs/features/TEMPLATE.md` for any new feature. Update ADRs in `docs/decisions/` if architectural decisions were made.

## Commit Messages

Write detailed commit messages. Use conventional commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).

**For features:** Summarize what was added and why. List key files created or modified.

**For bug fixes:** The commit body must include four sections:
1. **What** — What the bug was (observable symptom)
2. **Why** — Why it occurred (root cause)
3. **Fix** — How it was fixed (what changed)
4. **Prevention** — What preventive measures were added (tests, docs, lint rules)

## Principles

- **Security first** — Encrypt at rest, sanitize all external content, never trust user or feed input. Use production-grade libraries (DOMPurify, Web Crypto) over hand-rolled implementations.
- **Privacy and anonymity** — No telemetry, no analytics, no external calls except explicit user actions (fetching feeds). No data leaves the browser unless the user initiates it.
- **Open source first** — Prefer actively maintained OSS libraries where they reduce code and improve correctness. Do not reimplement what a well-maintained library handles better.
- **Framework-pragmatic** — Use React, TypeScript, and ecosystem libraries where they improve correctness, developer experience, and code sharing across platforms. Core modules remain framework-agnostic for portability.
- **Right-sized** — Use abstractions where they genuinely reduce complexity (components, hooks, stores). Avoid premature abstraction, but don't avoid *appropriate* abstraction.
- **Clean code** — Self-evident naming, small single-responsibility functions, explicit error handling via Result types. Functions should do one thing and their name should say what that thing is. If you need a comment to explain *what* code does, rename or extract instead. Comments only for *why* — never *what*.

### Key Patterns

- All core functions return `Result<T>` types — never throw for expected errors
- UI components are functional React with hooks — no class components
- State lives in Zustand stores — components subscribe to slices
- URL is the source of truth for navigation state (selected feed, article)
- Core modules have zero React/UI imports — they are the shared backend
- Sanitization delegated to DOMPurify — `dangerouslySetInnerHTML` only for pre-sanitized content
- TypeScript strict mode — no `any` except in type declarations for untyped libraries
- IndexedDB records store encrypted content + plaintext index fields for Dexie queries
- Feed format detection tries JSON parse first (for JSON Feed), then XML (for RSS/Atom)
- XML namespace-prefixed elements (`content:encoded`, `dc:creator`) must use `getElementsByTagName`, never `querySelector`

---

**Reminder: Every code change follows Red-Green-Refactor. No test, no code. No refactor, no commit.**
