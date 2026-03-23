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
npm run test:coverage # Run with V8 coverage (thresholds enforced)
npm run test:e2e      # Run Playwright E2E tests
npm run dev           # Dev server on http://localhost:3000
npm run serve         # Standalone Hono server (self-hosting, requires build first)
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
- **marked** — Markdown-to-HTML parsing. Used by site-specific extractors (e.g., GitHub adapter). Output always passed through DOMPurify.
- **Radix UI + shadcn/ui** — Headless UI primitives (`@radix-ui/react-*`) wrapped as styled components in `src/components/ui/`. Use these wrappers (Button, Dialog, AlertDialog, DropdownMenu, etc.) instead of building from scratch.
- **lucide-react** — Icon library. Import icons from `lucide-react`.
- **react-resizable-panels** — Resizable panel layout for the desktop 3-panel view.
- **sonner** — Toast notifications. `<Toaster>` mounted in `src/app.tsx`, trigger via `toast()` from `sonner`.
- **next-themes** — Theme provider (dark/light mode support).
- **Hono** — Lightweight Web standard server framework (14kB). Powers the standalone server (`server.ts`) for self-hosting. Uses same `Request/Response` API as shared handlers.
- **class-variance-authority** — Component variant definitions (used in `src/components/ui/`).
- **clsx + tailwind-merge** — Tailwind class merging via `cn()` utility.

### Data Flow

User adds feed URL → `feed-service.ts` (normalize URL, duplicate check) → `fetch` via `/api/feed` CORS proxy → `validator.ts` (RSS/Atom/JSON Feed detection) → `parser.ts` (extraction) → `sanitizer.ts` (DOMPurify) → `schema.ts` (object creation with guid) → `crypto.ts` (AES-GCM-256 encryption) → `db.ts` (Dexie/IndexedDB storage) → Zustand store updates → React re-renders → auto-selects new feed via URL navigation.

Full-text extraction is user-initiated: in reader panel, click "Extracted" → fetch via `/api/page` → `extractor.ts` → `defuddle-extractor.ts` (Defuddle parse → `cleanup.ts` → DOMPurify sanitize) → cached in extraction store and displayed.

### Core Modules (Framework-Agnostic TypeScript)

- **src/utils/result.ts** — Generic `Result<T>` type (`ok`/`err`) used by all core functions instead of throwing. Check `.ok` before accessing `.value`. Includes `andThen` for chaining and `fromPromise` for wrapping async calls.
- **src/utils/constants.ts** — DB name, crypto params, localStorage key constants (`LOCAL_STORAGE`), default passphrase.
- **src/core/storage/crypto.ts** — PBKDF2 key derivation + AES-GCM encrypt/decrypt + HMAC-SHA256 index hashing via Web Crypto API.
- **src/core/storage/db.ts** — Dexie-based storage. All data encrypted at rest. Index fields (url, feedId, guid) are HMAC-SHA256 hashed before storage for querying without exposing plaintext; content fields AES-GCM encrypted. Call `open(passphrase)` or `openWithKeys(dbKeyJwk, hmacKeyJwk)` before any operations.
- **src/core/storage/key-material.ts** — `deriveAndStoreKeys(passphrase)` derives all crypto keys (DB, HMAC, optional vault), exports as JWK, persists to localStorage. `loadStoredKeys()` reads them back. `clearStoredKeys()` removes them. Raw passphrase is never persisted.
- **src/core/storage/schema.ts** — `createFeed()`, `createArticle()` factory functions return Result types.
- **src/core/discovery/discovery.ts** — `discoverFeed(url)` runs a multi-strategy cascade to find a feed from a website URL.
- **src/core/discovery/strategies.ts** — Pure functions for each discovery strategy.
- **src/core/crypto/passphrase-generator.ts** — Generates cryptographically random passphrases using EFF large wordlist (4 words, ~51.7 bits entropy). `eff-wordlist.ts` contains the wordlist.
- **src/core/proxy/validate-url.ts** — Shared URL validation with SSRF protection (blocks private IPs, enforces http/https). Returns `Result<URL>`.
- **src/core/proxy/proxy-handler.ts** — Shared proxy logic for serverless functions. Validates target URL, fetches, and returns response.
- **src/core/extractor/extractor.ts** — Public API: `extract(html, url)` and `needsExtraction(article)`. Delegates to active extractor implementation.
- **src/core/extractor/defuddle-extractor.ts** — Defuddle-based extraction. Swap this import in `extractor.ts` to use a different library.
- **src/core/extractor/cleanup.ts** — `cleanExtractedContent(html)` removes empty elements, collapses consecutive `<br>` tags.
- **src/core/extractor/markdown.ts** — `markdownToHtml(md)` converts markdown to sanitized HTML via `marked` + DOMPurify.
- **src/core/extractor/adapters/** — Site-specific extraction adapters. `SiteAdapter` interface in `types.ts`, `AdapterRegistry` in `registry.ts` (O(1) domain-to-adapter lookup). `github-adapter.ts` extracts GitHub README as repo content. `default-adapter.ts` uses Defuddle. Add new adapters by implementing `SiteAdapter` and registering in the registry.
- **src/core/sync/types.ts** — `VaultData`, `EncryptedVault`, `SyncStorageAdapter` interfaces.
- **src/core/sync/vault-crypto.ts** — `deriveVaultId`, `deriveVaultKey`, `encryptVault`, `decryptVault`. Deterministic derivation from passphrase with domain-separated PBKDF2.
- **src/core/sync/sync-service.ts** — Client-side sync orchestrator: `exportVault`, `importVault`, `pushVault`, `pullVault`.
- **src/core/sync/sync-handler.ts** — Server-side `handleSyncRequest(request, adapter)` — shared `Request → Response` handler. Supports GET (pull), PUT (push), DELETE (vault removal).
- **src/core/sync/adapters/** — Storage adapter implementations: `memory-adapter.ts`, `filesystem-adapter.ts`, `vercel-blob-adapter.ts`, `resolve-adapter.ts`.
- **src/core/feeds/feed-service.ts** — `addFeedFlow(url)` orchestrates the full add-feed flow. `refreshFeed(feed)` and `refreshAllFeeds()` handle feed refresh with guid-based dedup.
- **src/core/parser/parser.ts** — `parse(text, feedUrl)` handles RSS 2.0, Atom 1.0, and JSON Feed 1.1.
- **src/core/parser/sanitizer.ts** — DOMPurify wrapper with allowlisted tags/attrs.

### Zustand Stores

- **src/stores/app-store.ts** — DB initialization, global error state, onboarding status. `initialize(passphrase)` opens the database. `checkOnboardingStatus()` reads from localStorage. `initializeReturningUser()` handles the full returning-user init flow (detect storage mode, open DB, optionally pull sync).
- **src/stores/feed-store.ts** — `feeds[]`, `selectedFeedId`, CRUD actions. Actions call core modules directly (`addFeedFlow`, `refreshAllFeeds`, etc.). `refreshAll()` pulls the sync vault first for sync users (cross-device feed discovery).
- **src/stores/article-store.ts** — `articles[]`, `selectedArticle`, `loadArticles(feedId)`, `selectArticle(article)` (auto-marks as read).
- **src/stores/extraction-store.ts** — `cache` (link → extracted HTML), `viewMode`, `fetchExtracted(url)`. Extraction is on-demand and cached.
- **src/stores/onboarding-store.ts** — Onboarding flow state machine: `welcome` → `storage-choice` → `passphrase-display` → `passphrase-confirm` → `initializing` (or `recovery` for returning users). Storage modes: `local` (client-only, skips passphrase confirmation) vs `sync` (cloud-enabled, requires passphrase confirmation). Generates passphrases via `passphrase-generator.ts`.
- **src/stores/sync-store.ts** — Cloud sync state and actions. Status: `local-only` | `syncing` | `synced` | `error`. State holds `credentials: SyncCredentials | null` (pre-derived vault ID + CryptoKey, never the raw passphrase). Actions: `enableSync(passphrase)` (derives credentials, stores derived keys, pushes vault), `restoreSync(credentials)` (returning sync users), `push()`, `pull()`, `scheduleSyncPush()` (5s debounce + 0-30s jitter), `disableSync()` (deletes server vault + clears stored keys), `logout()` (clears local data + resets to onboarding, preserves cloud vault).

### React Components

- **src/components/ui/** — shadcn/ui-style wrappers around Radix UI primitives (Button, Dialog, AlertDialog, DropdownMenu, Input, Sheet, Sidebar, Skeleton, ScrollArea, Tooltip, etc.). Use these as building blocks for all new UI.
- **src/components/layout/** — `header.tsx`, `panel.tsx` (layout primitives)
- **src/components/feeds/** — `feed-list.tsx`, `feed-item.tsx`, `add-feed-form.tsx`, `feed-favicon.tsx`
- **src/components/articles/** — `article-list.tsx`, `article-item.tsx`
- **src/components/reader/** — `reader-panel.tsx`, `view-toggle.tsx`, `article-content.tsx`
- **src/components/onboarding/** — Modal-based onboarding flow. `onboarding-modal.tsx` container with step components in `steps/` (welcome, storage-choice, passphrase-display, passphrase-confirm, recovery).
- **src/components/sync/** — `sync-setup-dialog.tsx` (dialog for enabling/disabling cloud sync, data management, vault deletion), `sync-status-chip.tsx` (color-coded status indicator: amber local, green synced, red error).
- **src/pages/feeds-page.tsx** — Main page component. Desktop: 3-panel CSS grid. Mobile: single panel with back navigation. Syncs URL params to Zustand stores.
- **src/lib/content-modes.ts** — Pure functions for content view modes (Feed/Extracted visibility, summary subheading detection, similarity/completeness heuristics). Used by `reader-panel.tsx`.
- **src/lib/decode-entities.ts** — Decodes HTML entities for plain text display.

### Routing

```
/feeds                                → Feed list (mobile: full screen)
/feeds/:feedId                        → Article list (mobile: full screen, desktop: panels 1+2)
/feeds/:feedId/articles/:articleId    → Reader (mobile: full screen, desktop: all 3 panels)
```

URL is the source of truth for navigation state. `FeedsPage` syncs URL params to Zustand stores.

### Hooks

- **src/hooks/use-keyboard-nav.ts** — Keyboard shortcuts for feed reader navigation. All shortcuts have verified behavior parity with their UI counterparts.
  - Article nav: `j`/`k` (next/prev — clicks DOM elements, same as mouse click)
  - Feed nav: `u`/`i` (next/prev feed — clicks sidebar buttons)
  - Actions: `o` (open original), `e` (toggle view via `toggleViewMode()`), `n` (add feed via custom event), `[` (toggle sidebar), `r` (refresh via `refreshAll()`)
  - Shortcuts are disabled when focus is in input/textarea/contenteditable
- **src/hooks/use-media-query.ts** — Responsive breakpoint detection. `useIsDesktop()` for ≥1024px.
- **src/hooks/use-mobile.ts** — `useIsMobile()` for <768px breakpoint (used by sidebar/sheet components).

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

Three-tier testing strategy. See [Testing Strategy](docs/testing-strategy.md) for the full guide.

**Tier 1 — Unit/Integration (Vitest + happy-dom, ~500+ tests):**
- Core modules, stores, components, hooks. Test files mirror `src/` under `tests/`.
- `fake-indexeddb` for db.ts tests. React Testing Library + userEvent for components.
- Store tests use `getState()`/`setState()` directly — no React rendering needed.
- Setup file: `tests/setup.ts`.

**Tier 2 — Structural Assertions (Vitest + RTL, ~57 tests):**
- Verify critical CSS classes (`overflow-hidden`, `min-h-0`, `h-svh`), ARIA attributes (`role="listbox"`, `aria-selected`), and DOM composition.
- Catch layout regressions that happy-dom can't detect via computed styles but can detect via class presence.
- Located in `tests/components/` alongside unit tests.

**Tier 3 — E2E (Playwright + Chromium, 56 tests across 9 spec files):**
- Two viewport projects: `desktop` (1280x720) and `mobile` (Pixel 5, 393x851).
- Test dir: `tests/e2e/`. Dev server on port 3001 (separate from dev on 3000).
- Feed responses mocked via `page.route()` with fixtures in `tests/e2e/feed-fixtures.ts`.
- Onboarding bypassed via `localStorage` in `tests/e2e/fixtures.ts`.

**Coverage thresholds (enforced by `npm run test:coverage`):**
- Statements/Lines/Functions: 90%. Branches: 83%.
- Excluded: `src/workers/**`, `src/main.tsx`, `src/**/*.d.ts`, `src/types/**`, `src/core/extractor/adapters/types.ts`, `src/core/sync/types.ts`, `src/components/ui/**` (shadcn wrappers).

**Test behavior, not implementation:**
- Tests should verify user-observable outcomes, not internal mechanisms.
- Bad: "toggleView sets viewMode to extracted" — only checks state change.
- Good: "pressing E triggers content extraction" — verifies the complete user action.
- If the same user action has multiple code paths (e.g., click handler vs keyboard shortcut), both must be tested for identical behavior — otherwise bugs slip through when one path diverges.

**Store tests vs component tests:**
- **Store unit tests** may assert on `getState()` — the store's state IS its observable output.
- **Component/page tests** should NOT replace store methods with mocks and assert on mock calls. Instead, use real store methods and assert on observable outcomes: rendered UI, URL changes, or resulting store state.
- Bad: `useFeedStore.setState({ selectFeed: mockSelectFeed }); expect(mockSelectFeed).toHaveBeenCalledWith("feed-1");`
- Good: `renderPage("/feeds/feed-1"); expect(useFeedStore.getState().selectedFeedId).toBe("feed-1");`

**happy-dom gotchas:**
- DOMPurify + happy-dom executes inline scripts during sanitization. Use non-callable code in test fixtures (e.g., `var x = 1;` not `alert(1)`).
- `querySelector` with CSS-escaped colons (e.g. `content\\:encoded`) may work in happy-dom but fail in browsers. Always use `getElementsByTagName` for XML namespace-prefixed elements.
- `CDATA` sections with namespace declarations may fail to parse. Use entity-escaped HTML (`&lt;p&gt;`) instead of `<![CDATA[<p>]]>`.
- `isContentEditable` may not behave identically to browsers. Dispatch keyboard events from the target element, not `document`.
- Radix UI `AlertDialog` renders curly quotes (`\u201C`/`\u201D`). Use flexible regex matchers (e.g., `/Remove.*Feed Name/`).

**Contract tests (Tier 1.5 — boundary verification):**
- Every client-server boundary must have a contract test that validates the client's request shape is accepted by the server's handler.
- Routing contract tests in `server.test.ts` verify that every Vercel serverless wrapper (`api/*.ts`) exports a handler for every HTTP method the shared handler supports. If you add or change a method, the test fails until the wrapper is updated.
- Integration contract tests verify that `proxyFetch()` builds requests that `handleProxyRequest()` can parse. These tests mock only the external outbound fetch, never the boundary between client and server code.
- **Rule: When a mock replaces a real function at a system boundary, a separate contract test must verify that both sides of the boundary agree on the interface.** Mocking `fetch` in a unit test is fine, but there must also be a test where the real request flows through the real handler.

### App Initialization Flow

`src/app.tsx` orchestrates startup via `AppInit`:

1. `checkOnboardingStatus()` reads `feedzero:onboarding-complete` from localStorage.
2. **New users** (`hasCompletedOnboarding === false`): `<OnboardingModal>` is shown (rendered outside `<BrowserRouter>`, always mounts). The onboarding store drives the step flow.
3. **Returning users** (`hasCompletedOnboarding === true`): `initializeReturningUser()` in `app-store.ts` handles the full init flow:
   - Tries `loadStoredKeys()` first — if derived keys exist, uses `openWithKeys()` (no passphrase needed)
   - Falls back to passphrase from localStorage for legacy users (auto-migrates: derives keys, stores them, removes raw passphrase)
   - Local-only users without stored keys: shows error (requires re-onboarding)
   - Sync users: reconstructs `SyncCredentials` from stored vault ID + JWK, pulls vault from server
4. Once `isDbReady`, the main app routes render.

`<OnboardingModal>` and `<SyncSetupDialog>` are mounted at the top level alongside `<BrowserRouter>`, not inside routes.

### CORS Proxy, Sync API & Server

All API handlers use the Web standard `Request → Response` pattern via shared handler functions (`proxy-handler.ts`, `sync-handler.ts`). Three entry points consume these handlers:

- **`server.ts`** — Hono standalone server for self-hosting (`npm run serve`). Mounts proxy + sync handlers + static file serving.
- **`api/*.ts`** — Vercel Serverless Functions. In git, these are thin wrappers (~5-10 lines) that import shared handlers from `src/core/`. During build, `scripts/build-api.js` replaces their content with self-contained esbuild bundles (all deps inlined) because **Vercel's builder compiles each `.ts` individually without bundling cross-directory imports**. See ADR 007.
- **`vite.config.js`** — Dev proxy using lazy-imported shared handlers with a memory adapter for sync.

**Three-entry-point rule:** Every API endpoint has three consumers (Hono, Vite, Vercel). When changing request format, HTTP method, headers, or URL structure, all three entry points MUST be updated and verified. The Vercel `api/*.ts` wrappers MUST export a named function for every HTTP method the shared handler supports. This is enforced by routing contract tests in `server.test.ts` — if you add a method to the shared handler, the test will fail until the Vercel wrapper exports it too. Never deploy without this verification.

**Endpoints**: `POST /api/feed` with `{"url":"..."}` body (feed proxy), `POST /api/page` with `{"url":"..."}` body (page proxy), `/api/sync` (GET/PUT/DELETE/HEAD encrypted vault).

**SSRF protections** — The proxy blocks requests to internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16–31.x, 192.168.x, 169.254.169.254) and only allows `http:`/`https:` protocols. Do not weaken these checks.

**Sync storage** — Uses a pluggable adapter (`SyncStorageAdapter` interface). Default: filesystem (`SYNC_STORAGE=filesystem`). Vercel: `SYNC_STORAGE=vercel-blob` + `BLOB_READ_WRITE_TOKEN`. Dev: memory adapter.

### Deployment

Deployed on **Vercel**. Build command: `npm run build:all` (Vite SPA build + `scripts/build-api.js` serverless function bundling). Output directory: `dist/`. `vercel.json` configures SPA routing (rewrites non-API paths to `index.html`). API routes (`/api/*`) pass through to serverless functions in `api/`.

**Adding a new serverless function:** Create `api/<name>.ts` that imports from `src/core/`. The build script auto-discovers all `api/*.ts` files and bundles them. No extra config needed. Mark any Vercel-provided runtime packages (like `@vercel/blob`) as `external` in `scripts/build-api.js`.

### Linting & Formatting

No ESLint or Prettier configuration exists in the project. TypeScript strict mode (`npx tsc --noEmit`) is the primary static analysis tool.

## Development Workflow

This project follows **Red-Green-Refactor (RGR)** — the TDD cycle where you write a failing test (red), make it pass with minimal code (green), then clean up (refactor). Every feature follows this exact sequence. **No step may be skipped or reordered.**

1. **PLAN** — Gherkin-style stories, minimal scope. Confirm with user before proceeding.

2. **RED** — Write failing tests first. Run them. They MUST fail. If they pass, the test is wrong — fix it before proceeding.
   - ⛔ **STOP: Do not write any production code until you have a failing test.**

3. **GREEN** — Write the minimum code to make the tests pass. Nothing more. Add JSDoc to all public functions. Add inline comments where intent or "why" is not obvious from the code itself. Do not comment the obvious.
   - ⛔ **STOP: Do not refactor yet. First verify all tests pass.**

4. **VERIFY** — Run full test suite (`npm test`) AND type check (`npx tsc --noEmit`). Confirm zero failures, zero regressions, zero type errors.
   - ⛔ **STOP: Do not proceed if any test fails or types error. Fix first.**

   **4a. VERIFY DEPLOYMENT ARTIFACTS** — If you changed any API endpoint (request format, HTTP method, URL structure, headers), verify:
   - The shared handler accepts the new format (check `proxy-handler.ts` or `sync-handler.ts`)
   - All three entry points are updated: `server.ts` (Hono), `vite.config.js` (dev), `api/*.ts` (Vercel)
   - The Vercel wrapper exports match `SUPPORTED_METHODS` (enforced by routing contract tests in `server.test.ts`)
   - ⛔ **STOP: Do not proceed if any entry point is missing the update. This is how production breaks.**

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

FeedZero exists to protect its users. It is used by journalists, activists, and people living under surveillance. Every decision — architecture, testing, deployment — must be made as if a user's safety depends on it, because it does.

**There is zero tolerance for regressions in core functionality, security, privacy, or anonymity. Working code must never break silently.**

- **Security first** — Encrypt at rest, sanitize all external content, never trust user or feed input. Use production-grade libraries (DOMPurify, Web Crypto) over hand-rolled implementations.
- **Privacy and anonymity** — No telemetry, no analytics, no external calls except explicit user actions (fetching feeds). No data leaves the browser unless the user initiates it.
- **Open source first** — Prefer actively maintained OSS libraries where they reduce code and improve correctness. Do not reimplement what a well-maintained library handles better.
- **Framework-pragmatic** — Use React, TypeScript, and ecosystem libraries where they improve correctness, developer experience, and code sharing across platforms. Core modules remain framework-agnostic for portability.
- **Right-sized** — Use abstractions where they genuinely reduce complexity (components, hooks, stores). Avoid premature abstraction, but don't avoid *appropriate* abstraction.
- **Clean code** — Self-evident naming, small single-responsibility functions, explicit error handling via Result types. Functions should do one thing and their name should say what that thing is. If you need a comment to explain *what* code does, rename or extract instead. Comments only for *why* — never *what*.
- **Reliability and resilience** — The app must work. Core flows (adding feeds, reading articles, syncing) must never regress. Every deployment artifact must be tested. Every client-server boundary must have a contract test. If a mock replaces a real boundary, a separate test must verify the contract across that boundary.

### Key Patterns

- All core functions return `Result<T>` types — never throw for expected errors
- UI components are functional React with hooks — no class components
- State lives in Zustand stores — components subscribe to slices
- URL is the source of truth for navigation state (selected feed, article)
- Core modules have zero React/UI imports — they are the shared backend
- Sanitization delegated to DOMPurify — `dangerouslySetInnerHTML` only for pre-sanitized content
- TypeScript strict mode — no `any` except in type declarations for untyped libraries
- IndexedDB records store encrypted content + HMAC-hashed index fields for Dexie queries (no plaintext metadata exposed)
- Feed format detection tries JSON parse first (for JSON Feed), then XML (for RSS/Atom)
- XML namespace-prefixed elements (`content:encoded`, `dc:creator`) must use `getElementsByTagName`, never `querySelector`
- **Key-data coupling invariant:** Stored derived keys (`feedzero:derived-keys` in localStorage) must always be able to decrypt local IndexedDB data. Only two operations may break this coupling: `open(passphrase)` (which derives fresh keys and re-opens the DB) and `importAll()` (which clears and re-encrypts all data). Any operation that modifies stored keys without re-encrypting data, or re-encrypts data without updating stored keys, is a bug. When transitioning between sync modes, use `exportCurrentKeys()` to persist the in-memory keys rather than deriving new ones.
- **Pull-before-mutate invariant:** Any flow that reads remote state and then modifies local state must fetch the remote data **before** any destructive local operations (`deleteDatabase`, `tryDeleteServerVault`). The recovery flow calls `pullVault()` first, then `initFresh(skipServerCleanup: true)`. This prevents destroying the vault you're trying to recover. Workflows with destructive + read operations on shared remote state need integration tests — mocked unit tests cannot catch temporal coupling bugs across module boundaries.

---

**Every code change follows Red-Green-Refactor. No test, no code. No refactor, no commit.**

**Every client-server boundary has a contract test. No mock without a contract. No deployment without verification.**

**FeedZero protects people. Act accordingly.**
