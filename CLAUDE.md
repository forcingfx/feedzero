# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## ⚠ Mandatory: Red-Green-Refactor

**Every code change MUST follow the RGR cycle. No exceptions.**

1. Write a failing test BEFORE writing any production code.
2. Write the minimum code to make the test pass.
3. Refactor the code you wrote and touched — this step is NOT optional.

For tasks with no testable behavior (config, docs), the refactor step still applies to any code touched. See [Development Workflow](#development-workflow) for the full sequence including VERIFY, DOCUMENT, and SMOKE.

## Build & Test Commands

```bash
npm test              # Run all unit/integration tests (Vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run with V8 coverage (thresholds enforced)
npm run test:e2e      # Run Playwright E2E tests
npm run dev           # Dev server on http://localhost:3000
npm run serve         # Standalone Hono server (self-hosting; build first)
npx tsc --noEmit      # TypeScript type check (strict mode)
```

Run a single test file: `npx vitest run <path/to/file>`.

## Architecture

FeedZero is a privacy-first RSS reader. React + TypeScript UI, Zustand state, React Router, Tailwind CSS v4. Core modules (`src/core/`, `src/utils/`) are framework-agnostic TypeScript with zero React/UI imports — they are the shared backend.

### Runtime Dependencies

- **UI**: React + React DOM (functional components only), React Router, Radix UI + shadcn/ui wrappers in `src/components/ui/` (Button, Dialog, AlertDialog, DropdownMenu, Sheet, Sidebar, etc. — use these, do not build from scratch), lucide-react icons, react-resizable-panels, sonner toasts (`<Toaster>` in `src/app.tsx`, trigger via `toast()`), next-themes, class-variance-authority, clsx + tailwind-merge via `cn()`.
- **State / storage**: Zustand (stores call core modules directly), Dexie.js (IndexedDB, encrypted).
- **Parsing / extraction**: feedsmith (RSS/Atom/JSON Feed + OPML), Defuddle (full-text extraction; pluggable), marked (markdown → HTML; always piped through DOMPurify), DOMPurify (XSS — do not hand-roll).
- **Server**: Hono (14kB, Web standard `Request/Response`; powers self-hosting via `server.ts`).

### Data Flow

Add feed: `feed-service.ts` (normalize, dedup) → `/api/feed` proxy → `validator.ts` → `parser.ts` → `sanitizer.ts` (DOMPurify) → `schema.ts` → `crypto.ts` (AES-GCM-256) → `db.ts` (Dexie) → Zustand → React → URL auto-selects new feed.

Full-text extraction (user-initiated): click "Extracted" → `/api/page` → `extractor.ts` → `defuddle-extractor.ts` → `cleanup.ts` → DOMPurify → cached in extraction store.

### Core Modules (Framework-Agnostic)

- **src/utils/result.ts** — `Result<T>` (`ok`/`err`) used everywhere instead of throwing. `andThen` chains; `fromPromise` wraps async.
- **src/utils/constants.ts** — DB name, crypto params, `LOCAL_STORAGE` keys, default passphrase.
- **src/core/storage/crypto.ts** — PBKDF2 + AES-GCM + HMAC-SHA256 via Web Crypto API.
- **src/core/storage/db.ts** — Dexie storage. Content AES-GCM encrypted; index fields (url, feedId, guid) HMAC-SHA256 hashed so we can query without exposing plaintext. Call `open(passphrase)` or `openWithKeys(dbKeyJwk, hmacKeyJwk)` first.
- **src/core/storage/key-material.ts** — `deriveAndStoreKeys`, `loadStoredKeys`, `clearStoredKeys`. Derives DB/HMAC/optional vault keys, persists JWK to localStorage. Raw passphrase is never persisted.
- **src/core/storage/schema.ts** — `createFeed()` / `createArticle()` factories returning `Result`.
- **src/core/discovery/** — `discoverFeed(url)` multi-strategy cascade; `strategies.ts` holds the pure functions.
- **src/core/crypto/passphrase-generator.ts** — EFF large wordlist, 4 words, ~51.7 bits entropy.
- **src/core/proxy/validate-url.ts** — SSRF-safe URL validation. Returns `Result<URL>`.
- **src/core/proxy/proxy-handler.ts** — Shared proxy logic for serverless functions.
- **src/core/extractor/extractor.ts** — Public `extract(html, url)` + `needsExtraction(article)`. Swap implementation by changing the import.
- **src/core/extractor/{defuddle-extractor,cleanup,markdown}.ts** — Defuddle impl; HTML cleanup; markdown→HTML via marked + DOMPurify.
- **src/core/extractor/adapters/** — Site-specific adapters. `SiteAdapter` interface, `AdapterRegistry` (O(1) domain lookup). `github-adapter` extracts README; `default-adapter` uses Defuddle.
- **src/core/sync/types.ts** — `VaultData`, `EncryptedVault`, `SyncStorageAdapter`.
- **src/core/sync/vault-crypto.ts** — Deterministic `deriveVaultId` + `deriveVaultKey` via domain-separated PBKDF2; `encryptVault` / `decryptVault`.
- **src/core/sync/sync-service.ts** — Client orchestrator: `exportVault`, `importVault`, `pushVault`, `pullVault`.
- **src/core/sync/sync-handler.ts** — Shared server `Request → Response` handler. GET (pull) / PUT (push) / DELETE.
- **src/core/sync/adapters/** — `memory`, `filesystem`, `vercel-blob`, `resolve-adapter`.
- **src/core/feeds/feed-service.ts** — `addFeedFlow(url)`, `refreshFeed`, `refreshAllFeeds` (guid-based dedup).
- **src/core/parser/parser.ts** — `parse(text, feedUrl)` via feedsmith (RSS 2.0, Atom 1.0, JSON Feed 1.1).
- **src/core/parser/sanitizer.ts** — DOMPurify wrapper, allowlisted tags/attrs.
- **src/core/opml/** — `opml-service.ts` (import/export via feedsmith), `url-list-parser.ts` (plain-text URL lists).
- **src/core/feedback/feedback-handler.ts** — Creates GitHub issues via REST API. Needs `GITHUB_FEEDBACK_TOKEN` (fine-grained PAT with `issues: write`) + `GITHUB_REPO` (e.g. `forcingfx/feedzero`).
- **src/core/sync/sync-stats-handler.ts** — Vault count stats; no PII.

### Zustand Stores

- **app-store** — DB init, global error, onboarding. `initialize(passphrase)`, `checkOnboardingStatus()`, `initializeReturningUser()` (detect mode, open DB, optionally pull sync).
- **feed-store** — `feeds[]`, `selectedFeedId`, CRUD. `refreshAll()` pulls the sync vault first for sync users so feeds added on another device materialize.
- **article-store** — `articles[]`, `selectedArticle`, `loadArticles`, `selectArticle` (auto-marks read).
- **extraction-store** — `cache` (link → HTML), `viewMode`, `fetchExtracted(url)`.
- **onboarding-store** — State machine: `welcome` → `storage-choice` → `passphrase-display` → `passphrase-confirm` → `initializing` (or `recovery`). Modes: `local` (skips confirm) vs `sync` (requires confirm).
- **sync-store** — Status: `local-only | syncing | synced | error`. Holds `credentials: SyncCredentials | null` (pre-derived vault ID + CryptoKey; never raw passphrase). Actions: `enableSync` (derives + pushes), `restoreSync`, `push`, `pull`, `scheduleSyncPush` (5s debounce + 0–30s jitter), `disableSync` (deletes server vault + clears stored keys), `logout` (clears local data + resets onboarding; preserves cloud vault).
- **import-store** — OPML/URL-list progress. `idle → importing → complete | error`.

### React Components

- **src/components/ui/** — shadcn/ui wrappers over Radix. Use these as primitives.
- **src/components/layout/** — header, panel.
- **src/components/feeds/**, **articles/**, **reader/** — list/item/reader for each domain.
- **src/components/onboarding/** — `onboarding-modal.tsx` + step components under `steps/`.
- **src/components/explore/**, **feedback/**, **settings/** — feature UIs.
- **src/components/sync/** — `sync-setup-dialog.tsx` (enable/disable, data mgmt, vault deletion), `sync-status-chip.tsx` (amber local / green synced / red error).
- **src/pages/feeds-page.tsx** — Desktop: 3-panel CSS grid. Mobile: single panel + back nav. Syncs URL params → Zustand.
- **src/lib/content-modes.ts** — Pure view-mode logic for reader-panel.
- **src/lib/decode-entities.ts** — HTML entity decoding for plain-text display.

### Routing

```
/feeds                                → Feed list (mobile: full screen)
/feeds/:feedId                        → Article list (mobile: full screen; desktop: panels 1+2)
/feeds/:feedId/articles/:articleId    → Reader (mobile: full screen; desktop: all 3 panels)
```

URL is the source of truth for navigation state. `FeedsPage` syncs URL params → Zustand.

### Hooks

- **use-keyboard-nav** — Article nav `j`/`k` (clicks DOM elements — same code path as mouse). Feed nav `u`/`i`. Actions: `o` open original, `e` toggle view (`toggleViewMode()`), `n` add feed (custom event), `[` toggle sidebar, `r` refresh. Disabled when focus is in input/textarea/contenteditable.
- **use-media-query / use-mobile** — `useIsDesktop()` ≥1024px; `useIsMobile()` <768px (sidebar/sheet).

### Styling

Single CSS entry: `src/index.css`. Tailwind CSS v4 via `@tailwindcss/vite` (zero runtime cost).

- `@theme` — Design tokens (`--color-*`, `--font-*`).
- `@layer base` — Resets, layout grid (`250px 300px 1fr`), base button/input styles.
- Use Tailwind utilities in JSX with `cn()` from `src/lib/utils.ts`.
- **Spacing** — Use Tailwind v4's default numeric scale (`p-4`, `gap-2`). Do **not** define `--spacing-xs/sm/md/lg/xl` in `@theme` — these collide with `max-w-*` utilities (`max-w-lg` resolves to `--spacing-lg` instead of `--container-lg`). [Tailwind v4 gotcha](https://github.com/tailwindlabs/tailwindcss/discussions/17777).

### Types & Service Worker

- **src/types/index.ts** — `Feed`, `Article`, `CreateFeedInput`, `CreateArticleInput`.
- **src/workers/service-worker.js** — Excluded from test coverage.

### Testing

Three-tier strategy. See [docs/testing-strategy.md](docs/testing-strategy.md) for the full guide.

**Tier 1 — Unit/Integration (Vitest + happy-dom)**: Core modules, stores, components, hooks. Tests mirror `src/` under `tests/`. `fake-indexeddb` for db tests; RTL + userEvent for components; store tests use `getState()`/`setState()` directly. Setup: `tests/setup.ts`.

**Tier 2 — Structural assertions (Vitest + RTL)**: Verify critical CSS classes (`overflow-hidden`, `min-h-0`, `h-svh`), ARIA, DOM composition. Catches regressions happy-dom can't see in computed styles.

**Tier 3 — E2E (Playwright + Chromium)**: Two viewports (`desktop` 1280×720, `mobile` Pixel 5). `tests/e2e/`, dev server on port 3001. Feeds mocked via `page.route()` with `feed-fixtures.ts`. Onboarding bypassed via localStorage (`tests/e2e/fixtures.ts`). First-launch auto-subscribe to `https://feedzero.app/releases.xml` is best-effort (try/catch) so a network miss is silent.

**Coverage thresholds** (`npm run test:coverage`): Statements/Lines/Functions 90%; Branches 83%. Excluded: `src/workers/**`, `src/main.tsx`, `*.d.ts`, `src/types/**`, `src/core/extractor/adapters/types.ts`, `src/core/sync/types.ts`, `src/components/ui/**`.

**Test behavior, not implementation**: Verify user-observable outcomes, not internal mechanisms.
- Bad: "toggleView sets viewMode to extracted" — only checks state change.
- Good: "pressing E triggers content extraction" — verifies the user action.
- If a user action has multiple code paths (click + keyboard), test both.

**Store tests vs component tests**:
- Store unit tests *may* assert on `getState()` — state is the store's observable output.
- Component/page tests must NOT replace store methods with mocks and assert on mock calls. Use real store methods; assert on rendered UI, URL, or resulting store state.
- Bad: `useFeedStore.setState({ selectFeed: mockSelectFeed }); expect(mockSelectFeed).toHaveBeenCalledWith("feed-1");`
- Good: `renderPage("/feeds/feed-1"); expect(useFeedStore.getState().selectedFeedId).toBe("feed-1");`

**Playwright gotchas**:
- `transition-all` on interactive elements makes them "not stable". Use `transition-colors` or scoped properties; otherwise `{ force: true }` after confirming visibility.
- Sidebar transitions `duration-200 ease-in-out`. Wait for `data-state` to change, not `waitForTimeout`.
- Use `selectFeedInSidebar(page, name)` from `fixtures.ts` — it handles opening the sidebar on mobile.

**happy-dom gotchas**:
- DOMPurify + happy-dom executes inline scripts during sanitization. Use non-callable fixtures (`var x = 1;`, not `alert(1)`).
- CSS-escaped colons (`content\\:encoded`) may work in happy-dom but fail in browsers — always use `getElementsByTagName` for XML namespace-prefixed elements.
- CDATA with namespace declarations may fail to parse. Use entity-escaped HTML (`&lt;p&gt;`) instead.
- `isContentEditable` may differ from browsers. Dispatch keyboard events from the target element, not `document`.
- Radix `AlertDialog` renders curly quotes (`“`/`”`). Use flexible regex matchers.

**Tier 2.5 — Smoke against real external services**: When a feature depends on external data (favicons, feeds, extraction), mocked tests alone are insufficient. Mocks encode your *belief* about what the service returns; if that belief is wrong, all mocked tests pass while the feature is broken (e.g. TechCrunch's `favicon.ico` is a 198-byte placeholder).
- **Rule**: Before deploying a feature that fetches externally, `curl` the real endpoint and verify the response matches your fixtures.
- For fallback chains (A → B → C), test that the *first* strategy works for the sites users care about, not just that the chain eventually produces *something*.

**Tier 2.5 — Multi-layer caching**: Features with multiple cache layers (browser HTTP, localStorage, in-memory Map) need end-to-end invalidation tests. A unit test that clears one layer while another serves stale data is a false green.
- **Rule**: New endpoints start with `Cache-Control: no-cache`. Add caching after the endpoint is verified in production.
- **Rule**: A "clear cache" action must clear ALL layers — in-memory, localStorage, and browser HTTP (via hard-reload guidance or cache-busting query params).

**Tier 1.5 — Contract tests (boundary verification)**:
- Every client-server boundary needs a contract test that the client's request shape is accepted by the server's handler.
- Routing contract tests in `server.test.ts` verify every Vercel wrapper (`api/*.ts`) exports a handler for every method the shared handler supports.
- Integration contract tests verify `proxyFetch()` builds requests `handleProxyRequest()` can parse. Mock only the outbound external fetch, never the client/server boundary.
- **Rule**: When a mock replaces a real function at a system boundary, a separate contract test must verify both sides agree on the interface.

### App Initialization Flow

`src/app.tsx` orchestrates startup via `AppInit`:

1. `checkOnboardingStatus()` reads `feedzero:onboarding-complete` from localStorage.
2. **New users**: `<OnboardingModal>` renders (outside `<BrowserRouter>`, always mounted). The onboarding store drives steps.
3. **Returning users**: `initializeReturningUser()` in `app-store.ts`:
   - Tries `loadStoredKeys()` first — if derived keys exist, uses `openWithKeys()` (no passphrase needed).
   - Falls back to passphrase from localStorage for legacy users (auto-migrates: derives keys, stores them, removes raw passphrase).
   - Local-only users without stored keys: error (requires re-onboarding).
   - Sync users: reconstructs `SyncCredentials` from stored vault ID + JWK, pulls vault.
4. Once `isDbReady`, routes render.

`<OnboardingModal>` and `<SyncSetupDialog>` mount at the top level alongside `<BrowserRouter>`, not inside routes.

### CORS Proxy, Sync API & Server

All API handlers use the Web standard `Request → Response` pattern via shared handler functions (`proxy-handler.ts`, `sync-handler.ts`). Three entry points consume them:

- **`server.ts`** — Hono standalone for self-hosting (`npm run serve`). Mounts proxy + sync + static serving.
- **`api/*.ts`** — Vercel Serverless Functions. Source files are thin wrappers (~5-10 lines) that import from `src/core/`. The build script `scripts/build-api.js` overwrites them with self-contained esbuild bundles because **Vercel compiles each `.ts` individually without bundling cross-directory imports** (some `api/*.ts` in git may already contain bundled output — the build script overwrites regardless). See ADR 007.
- **`vite.config.js`** — Dev proxy with lazy-imported shared handlers + memory adapter for sync.

**Three-entry-point rule**: Every API endpoint has three consumers (Hono, Vite, Vercel). When changing request format, HTTP method, headers, or URL structure, all three MUST be updated. The Vercel `api/*.ts` wrappers MUST export a named function for every method the shared handler supports — enforced by routing contract tests in `server.test.ts`. Never deploy without verifying this.

**Endpoints**: `POST /api/feed` `{url}` (feed proxy), `POST /api/page` `{url}` (page proxy), `/api/sync` (GET/PUT/DELETE/HEAD encrypted vault), `GET /api/icon` (favicon proxy), `POST /api/feedback` (→ GitHub issue, requires `GITHUB_FEEDBACK_TOKEN` + `GITHUB_REPO`), `GET /api/stats-sync`.

**SSRF protections** — Proxy blocks internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16–31.x, 192.168.x, 169.254.169.254) and only allows `http`/`https`. Do not weaken these.

**Sync storage** — Pluggable `SyncStorageAdapter`. Default: filesystem (`SYNC_STORAGE=filesystem`). Vercel: `SYNC_STORAGE=vercel-blob` + `BLOB_READ_WRITE_TOKEN`. Dev: memory.

### Deployment

Deployed on **Vercel**. Build: `npm run build:all` (Vite SPA + `scripts/build-api.js` serverless bundling). Output: `dist/`. `vercel.json` configures SPA rewrites (non-API → `index.html`); `/api/*` passes through to `api/`.

**Adding a new serverless function**: Create `api/<name>.ts` importing from `src/core/`. The build script auto-discovers `api/*.ts`. Mark Vercel-provided packages (e.g. `@vercel/blob`) as `external` in `scripts/build-api.js`.

### Linting & Formatting

No ESLint or Prettier. TypeScript strict mode (`npx tsc --noEmit`) is the primary static analysis.

## Development Workflow

This project follows **Red-Green-Refactor-Smoke (RGR+S)**. Every change follows this sequence. No step may be skipped or reordered.

**Why SMOKE on top of RGR**: two production bugs (2026-05-12 sync regression, 2026-05-14 stats-always-zero) shared a class — code was internally correct (unit tests green) but the *system* was wrong (stale env var, in-memory adapter resetting on cold start). Unit tests can't see this: they run in one process against in-memory fakes. Only a test hitting the *deployed* system on *real* infrastructure can. See [Smoke tests](#smoke-tests).

1. **PLAN** — Gherkin-style stories, minimal scope. Confirm with user before proceeding.
2. **RED** — Write failing tests first. Run them. They MUST fail. If they pass, the test is wrong — fix it before proceeding. ⛔ No production code until you have a failing test.
3. **GREEN** — Minimum code to pass. JSDoc on public functions. Comments only for non-obvious *why*. ⛔ Do not refactor yet — first verify all tests pass.
4. **VERIFY** — Run `npm test`, `npx tsc --noEmit`, and `npm run test:e2e`. Zero failures, zero regressions, zero type errors. E2E is the final safety net for user-facing behavior; unit-green + E2E-red means broken for users.
   - **4a. Deployment artifacts** — If you changed any API endpoint (request format, method, URL, headers), verify: shared handler accepts the new format; all three entry points updated (`server.ts`, `vite.config.js`, `api/*.ts`); Vercel wrapper exports match `SUPPORTED_METHODS`. ⛔ This is how production breaks.
5. **REFACTOR** — Mandatory. Extract unclear blocks; remove duplication; one thing per function; intention-revealing names; Boy Scout Rule. Re-run `npm test` after.
6. **DOCUMENT** — Update `docs/architecture.md`, `docs/data-schema.md`, and `docs/features/*` for changed behavior. New feature → new doc from `docs/features/TEMPLATE.md`. New architectural decisions → ADR in `docs/decisions/`.
7. **SMOKE** — For any change affecting production behavior (endpoint handlers, data layer, adapter resolution, deployment artifacts), add a smoke test under `tests/smoke/` exercising the **live deployed system** after merge. Run via `SMOKE_TESTS=1 npx vitest run tests/smoke/<name>` once Vercel reports Ready. A PR introducing a production code path without a smoke test is incomplete. ⛔ If it fails after deploy, revert or roll forward immediately.

## Smoke tests

Smoke tests in `tests/smoke/` run only when `SMOKE_TESTS=1`. They are **not** part of `npm test`.

They:
- Hit real production URLs (`https://my.feedzero.app/api/*`) via `fetch`.
- Assert system-level invariants the unit suite can't check: "adapter X resolves to Upstash in prod", "rate limit 429s appear after N requests", "vault PUT then GET returns the same bytes against the real backend".
- Are tolerant of side effects: a test that exhausts a rate-limit bucket must wait for the window to reset before asserting "normal traffic works".
- Honor `SMOKE_BASE_URL` for staging / preview environments.

What NOT to assert:
- Unit-level behavior (function returns X for Y) — RED's job.
- UI rendering — Playwright's job.
- Per-user state — smoke tests are stateless and parallelizable.
- Anything that would log raw IPs, user emails, license tokens, or vault ciphertext. Same anonymity floor as production logs.

Reference: `tests/smoke/release-feed.test.ts`, `tests/smoke/rate-limiter.test.ts`.

## Commit Messages

Conventional commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`). Detailed bodies.

**Features**: what was added and why; list key files.

**Bug fixes** require four sections in the body:
1. **What** — observable symptom
2. **Why** — root cause
3. **Fix** — what changed
4. **Prevention** — tests, docs, or lint rules added

## Multi-agent hygiene

Two or more agents may run in parallel working trees. Uncommitted work is fragile — a `git reset --hard` from a co-located agent wipes it silently.

- **Commit after every successful GREEN.** Small conventional commits; never batch unrelated RGR cycles. The reflog survives `reset --hard` for ~90 days; uncommitted work survives nothing.
- **Before any destructive git op** (`reset --hard`, `clean -fd`, `checkout .`, `stash drop`, force-push, branch delete): run `git status` and describe what you see. If there are modifications you did not author, stop and ask. Default to preserve, not clear.
- **For parallel tasks, use a worktree**, not the shared tree:
  - Delegated subagents: `Agent` tool with `isolation: "worktree"`.
  - Whole sessions: `git worktree add ../feedzero-wt-<feature> -b feat/<feature>`. The `feedzero-landing/` sister repo stays shared (runtime coupling only — the app fetches the feed over HTTP, not from disk).
- **Landing/feedzero contract changes are serialized.** When a change spans both repos (landing serves `https://feedzero.app/releases.xml`; feedzero consumes), ship landing first, then feedzero. The first-launch auto-subscribe is try/catch so a stale URL is non-fatal, but new users silently miss the release feed until the next refresh.
- **Don't touch code you didn't author.** If `git status` shows files modified by another agent or pre-existing user WIP: don't stage, don't revert, don't include in your commits.
- **When splitting one uncommitted tree across multiple commits**, prefer `git add -p`. Create a safety stash (`git stash push -u && git stash apply`) first.

## Principles

FeedZero exists to protect its users — journalists, activists, and people living under surveillance. Every decision must be made as if a user's safety depends on it, because it does.

**Zero tolerance for regressions in core functionality, security, privacy, or anonymity. Working code must never break silently.**

- **Security first** — Encrypt at rest, sanitize all external content, never trust user or feed input. Production-grade libraries (DOMPurify, Web Crypto) over hand-rolled.
- **Privacy and anonymity** — No telemetry, no analytics, no external calls except explicit user actions. No data leaves the browser unless the user initiates it.
- **Open source first** — Prefer maintained OSS where it reduces code and improves correctness.
- **Framework-pragmatic** — Use React/TypeScript/ecosystem where they improve correctness and DX. Core modules stay framework-agnostic for portability.
- **Right-sized** — Use abstractions where they genuinely reduce complexity. Avoid premature abstraction; don't avoid *appropriate* abstraction.
- **Clean code** — Self-evident naming, small single-responsibility functions, explicit `Result` error handling. If a comment explains *what*, rename or extract instead. Comments only for *why*.
- **Reliability** — Core flows (add feed, read, sync) must never regress. Every deployment artifact tested. Every client-server boundary has a contract test.

### Clean Code rules

Working code-review checklist (adapted from [Lukaszuk's clean-code summary](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) of Martin's *Clean Code*).

**General** — Follow surrounding-code conventions. Keep it simple. Boy Scout Rule (leave files cleaner). Always find the root cause; a symptom-fix that doesn't explain the symptom is a bug waiting to recur.

**Design** — Push configurable data to high levels. Prefer polymorphism / dispatch tables to long `if/else` or `switch`; state machines live in dedicated modules. Use dependency injection over globals/singletons. Law of Demeter — no `a.b().c().d()` chains. Don't over-configure; flags and toggles are debt.

**Names** — Descriptive, unambiguous, pronounceable, searchable. `i`/`j`/`tmp` only in tight obvious loops. Replace magic numbers with named constants. Meaningful distinctions (`userInfo` vs `userData` is a smell). No type-encoding prefixes (`strName`, `IUser`).

**Functions** — Small (one screen max — extract). Do one thing — the name describes it fully. Fewer arguments (three is plenty; five is a refactor). No side effects beyond what the name says. No flag arguments — split into two functions.

**Comments** — Explain in code first (rename, extract, restructure). Don't repeat what code says. Delete commented-out code — git remembers. Use comments for *why*: hidden constraints, surprising trade-offs, bug references.

**Structure** — Vertical blank lines separate concepts; related code stays vertically dense. Declare variables close to use. Callees below callers (top-down readability). Short lines. Don't horizontally align `=` or types.

**Objects and data structures** — Hide internal structure; don't return mutable references that callers mutate. Prefer plain TypeScript types for transport between modules; reserve classes for behavior with invariants. Small, few fields, single responsibility. Composition over inheritance.

**Tests** — One logical assertion per test (multiple `expect()` for one assertion is fine). Readable (a worked example of how to use the unit). Independent. Repeatable (no clocks, unseeded random, or external network in unit tests). Fast — the full suite is ~9s; keep it that way.

**Code smells vocabulary** — Rigidity (small change cascades), Fragility (change here breaks unrelated there), Immobility (can't reuse, tangled in context), Needless complexity (anticipated requirements that never came), Needless repetition (copy-paste instead of extraction), Opacity (intent unclear at a glance).

### Key Patterns

- All core functions return `Result<T>` — never throw for expected errors.
- UI components are functional React with hooks — no classes.
- State lives in Zustand stores — components subscribe to slices.
- URL is the source of truth for navigation state.
- Core modules have zero React/UI imports — they are the shared backend.
- Sanitization delegated to DOMPurify — `dangerouslySetInnerHTML` only for pre-sanitized content.
- TypeScript strict — no `any` except in type declarations for untyped libs.
- IndexedDB stores encrypted content + HMAC-hashed index fields (no plaintext metadata exposed).
- Feed detection tries JSON parse first (JSON Feed), then XML (RSS/Atom).
- XML namespace-prefixed elements (`content:encoded`, `dc:creator`) must use `getElementsByTagName`, never `querySelector`.
- **Key-data coupling invariant**: Stored derived keys (`feedzero:derived-keys` in localStorage) must always decrypt local IndexedDB data. Only two operations may break this coupling: `open(passphrase)` (derives fresh keys + re-opens DB) and `importAll()` (clears + re-encrypts all data). Any operation that modifies stored keys without re-encrypting data, or re-encrypts data without updating stored keys, is a bug. When transitioning between sync modes, use `exportCurrentKeys()` to persist the in-memory keys rather than deriving new ones.
- **Quality-first fallback chains**: When a feature has multiple strategies (e.g., favicon: smart resolver → well-known paths → third-party), put the highest-quality source first, not the fastest. A fast bad result that gets cached is worse than a slow good result. Client and server must agree on quality thresholds — or only one layer should validate. A dumb proxy that passes through garbage defeats a smart resolver running after it.
- **Trace the full request path before deploying**: For any feature spanning client → server → external → response → cache → render, trace every step with real data. Mocked tests prove logic; only end-to-end traces prove the system works. Ask: (1) what does the external service actually return? (2) which cache stores it first? (3) does the cached result survive the user's "clear/retry"?
- **Core modules must not import from UI components.** Stores (`src/stores/`) and core (`src/core/`) are the shared backend; they must never import from `src/components/`. If a store needs a UI side effect, use an event, a shared utility in `src/utils/`/`src/core/`, or let the UI react to store state changes.
- **Pull-before-mutate invariant**: Any flow that reads remote state and then modifies local state must fetch the remote data **before** any destructive local op (`deleteDatabase`, `tryDeleteServerVault`). The recovery flow calls `pullVault()` first, then `initFresh(skipServerCleanup: true)`. Otherwise you destroy the vault you're trying to recover. Workflows with destructive + read operations on shared remote state need integration tests; mocked unit tests can't catch temporal coupling across module boundaries.

---

**Visual changes must be visually verified** in a real browser — not just by checking class names in unit tests. Use Playwright screenshots or the dev server.

**Red-Green-Refactor. No test, no code. No refactor, no commit. No mock without a contract. No deployment without verification.**

**FeedZero protects people. Act accordingly.**
