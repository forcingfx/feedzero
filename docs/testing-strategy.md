# Testing Strategy

## Overview

FeedZero uses a four-tier testing strategy to catch regressions at different levels of abstraction:

1. **Unit/Integration tests** (Vitest + happy-dom) — Fast, isolated tests for core modules, stores, and component behavior
2. **Structural assertion tests** (Vitest + React Testing Library) — Verify critical CSS classes, ARIA attributes, and component composition in rendered output
3. **E2E tests** (Playwright + Chromium) — Exercise the full app in real desktop and mobile browser viewports
4. **SMOKE tests** (Vitest + node env, run on demand) — Exercise the **live deployed production system** after merge. Catch the class of bug where the code is internally correct (1-3 all pass) but the deployed environment is wrong: config drift, missing env vars, wrong adapter resolved, serverless state not shared across lambdas. See [ADR 011](decisions/011-smoke-tests-in-rgr.md) for the workflow change that codifies SMOKE as step 7 of the RGR cycle.

## Test Pyramid

```
        ┌────────────────────┐
        │  SMOKE (production) │  9 test files, run on demand
        │  Live deployed env  │  Real Upstash, real Vercel lambdas
        ├─────────────────────┤
        │   E2E Tests          │  9 spec files, 56 tests
        │  (Playwright)        │  Real browser, desktop + mobile
        ├──────────────────────┤
        │  Structural          │  ~10 test files
        │  Assertions          │  CSS classes, ARIA, DOM composition
        ├──────────────────────┤
        │  Unit /              │  ~140 test files, 1900+ tests
        │  Integration         │  Core modules, stores, components
        └──────────────────────┘
```

SMOKE sits ABOVE E2E because it asserts the production system; E2E asserts the dev-server-and-mocks system. SMOKE catches what E2E cannot.

## Running Tests

```bash
npm test              # All Vitest tests (unit + structural)
npm run test:watch    # Watch mode
npm run test:coverage # V8 coverage with thresholds enforced
npm run test:e2e      # Playwright E2E tests (starts Vite on port 3001)
npx tsc --noEmit      # TypeScript type check (run alongside tests)
```

Run a single Vitest file:
```bash
npx vitest run tests/core/parser/parser.test.js
```

Run a single E2E spec:
```bash
npx playwright test tests/e2e/onboarding.spec.ts
```

Run E2E tests for a specific project:
```bash
npx playwright test --project=desktop
npx playwright test --project=mobile
```

## Tier 1: Unit and Integration Tests

**Framework:** Vitest with happy-dom environment
**Location:** `tests/` (mirrors `src/` structure)
**File pattern:** `*.test.{js,ts,tsx}`

### What they cover

| Category | Examples | Test Pattern |
|----------|----------|--------------|
| Core modules | Parser, sanitizer, validator, feed-service, crypto | Pure function testing with Result type assertions |
| Storage | db.ts, schema.ts, crypto.ts | Uses `fake-indexeddb` for IndexedDB |
| Stores | feed-store, article-store, app-store, sync-store | Zustand `getState()`/`setState()` directly, no React rendering |
| Components | ArticleList, FeedItem, ReaderPanel, OnboardingModal | React Testing Library + userEvent |
| Hooks | use-keyboard-nav | `renderHook()` with DOM assertions |
| Sync adapters | filesystem-adapter, memory-adapter, vercel-blob-adapter | Mock external dependencies, test Result types |

### Conventions

- **Store tests** use `getState()` and `setState()` directly — no need to render React components.
- **Component tests** mock store dependencies and core modules. Use `vi.mock()` at the top of each file.
- **Core module tests** are pure — no mocking needed unless testing integration points (fetch, crypto API).
- All core functions return `Result<T>` types. Assert with `isOk()`, `isErr()`, and `unwrap()` from `@/utils/result`.

## Tier 2: Structural Assertion Tests

**Framework:** Vitest + React Testing Library (same as unit tests)
**Location:** `tests/components/` alongside component unit tests
**Purpose:** Guard against CSS class and DOM structure regressions that cause layout bugs

These tests render components and assert on specific CSS classes, ARIA attributes, and DOM composition. They run in happy-dom so they can't verify computed layouts, but they catch the class of bug where a CSS class like `overflow-hidden` or `min-h-0` gets accidentally removed.

### Test files

| File | What it guards |
|------|---------------|
| `tests/components/layout/feeds-page-layout.test.tsx` | Desktop 3-panel layout classes (`h-svh`, `overflow-hidden`, `flex-1`, `min-h-0`), mobile single-panel structure, `role="main"` landmark |
| `tests/components/layout/app-sidebar-layout.test.tsx` | Sidebar composition (rail, header, content, footer) |
| `tests/components/articles/article-accessibility.test.tsx` | Listbox/option ARIA roles, `aria-selected`, keyboard activation, `tabIndex` |
| `tests/components/feeds/add-feed-form.test.tsx` | Input `inputMode="url"`, disabled states during loading, toast calls, focus management |
| `tests/components/feeds/app-sidebar-states.test.tsx` | Empty state text, active feed highlight, spinner during refresh, delete confirmation dialog |
| `tests/components/reader/article-content.test.tsx` | DOMPurify sanitization, script stripping, `max-w-180` class, empty content handling |
| `tests/components/reader/view-toggle.test.tsx` | Toggle visibility for single/multiple modes, button labels, active mode highlight |

### When to add structural tests

Add structural assertions when:
- A CSS class is critical for layout correctness (scroll containment, flex layout, overflow)
- An ARIA attribute is required for accessibility (roles, `aria-selected`, `tabIndex`)
- A component's DOM composition must stay stable (e.g., ScrollArea wrapping a panel)
- A bug was caused by a missing or changed class name

## Tier 3: E2E Tests

**Framework:** Playwright with Chromium
**Location:** `tests/e2e/`
**File pattern:** `*.spec.ts`
**Dev server:** Vite on port 3001 (separate from dev on 3000)

### Viewport projects

| Project | Device | Viewport | Purpose |
|---------|--------|----------|---------|
| `desktop` | Desktop Chrome | 1280x720 | Tests 3-panel layout (triggers `useIsDesktop()` at >=1024px) |
| `mobile` | Pixel 5 | 393x851 | Tests single-panel layout, offcanvas sidebar, back navigation |

### Spec files

| File | Tests | What it covers |
|------|-------|---------------|
| `onboarding.spec.ts` | 9 | Welcome modal, storage choice, local-only/sync paths, recovery, returning user skip |
| `feed-management.spec.ts` | 7 | Add feed, auto-select, title parsing, remove with confirm, duplicate/invalid errors |
| `article-navigation.spec.ts` | 9 | Feed/article selection, URL updates, auto-select first, read state, mobile navigation |
| `content-viewing.spec.ts` | 7 | Feed content rendering, view toggle, extraction fetch/cache, entity decoding |
| `keyboard-navigation.spec.ts` | 6 | j/k focus movement, Enter activation, Escape return, input field bypass, boundaries |
| `layout-scroll.spec.ts` | 8 | Header pinned, independent panel scrolling, no document scroll, resize, sidebar toggle |
| `feed-refresh.spec.ts` | 3 | Refresh with new articles, spinner, duplicate prevention |
| `sync.spec.ts` | 5 | Local-only chip, setup dialog, enable sync, save/confirm flow, delete all data |
| `error-states.spec.ts` | 3 | Network error toast, non-feed URL error, extraction failure fallback |

### E2E helpers

| File | Purpose |
|------|---------|
| `tests/e2e/fixtures.ts` | `feedPage` fixture (skips onboarding via localStorage, navigates to `/feeds`), `skipOnboarding()` helper |
| `tests/e2e/feed-fixtures.ts` | `SAMPLE_RSS`, `SAMPLE_ATOM`, `SAMPLE_JSON_FEED`, `SAMPLE_PAGE_HTML` fixture data; `mockFeedEndpoint()` and `mockPageEndpoint()` for `page.route()` interception |

### E2E patterns

- **Onboarding bypass:** Set `localStorage("feedzero:onboarding-complete", "true")` via `page.addInitScript()` before navigation.
- **Feed mocking:** Use `page.route("**/api/feed*", ...)` to intercept network requests with fixture XML/JSON. For refresh tests, use a mutable reference (`let feedResponse = SAMPLE_RSS`) and swap it before re-fetching.
- **Mobile sidebar dismiss:** The Radix Sheet overlay requires real pointer events — use `page.mouse.click(x, y)` at coordinates in the overlay area, not `page.keyboard.press("Escape")`.
- **Strict mode selectors:** When text like "First Article" appears in both the article list and reader heading, scope with `page.locator('[role="option"]', { hasText: text })`.
- **Article store reload after refresh:** After `refreshAllFeeds()`, articles are in the DB but the article store doesn't auto-reload. Navigate away and back to trigger `loadArticles()`.

## Coverage

### Thresholds (enforced by `npm run test:coverage`)

| Metric | Threshold |
|--------|-----------|
| Statements | 90% |
| Branches | 83% |
| Functions | 90% |
| Lines | 90% |

Branch coverage is set to 83% because many core modules have untested error-recovery branches that are difficult to exercise in happy-dom (e.g., crypto API failures, IndexedDB edge cases). The other three metrics are held at 90%.

### Excluded from coverage

| Pattern | Reason |
|---------|--------|
| `src/workers/**` | Service worker — no Vitest equivalent |
| `src/main.tsx` | App entry point — trivial ReactDOM.createRoot call |
| `src/**/*.d.ts` | TypeScript declaration files — no runtime code |
| `src/types/**` | Pure interface definitions — no runtime code |
| `src/core/extractor/adapters/types.ts` | Pure interface — no runtime code |
| `src/core/sync/types.ts` | Pure interface — no runtime code |
| `src/components/ui/**` | shadcn/ui generated wrappers — third-party code that delegates to Radix UI primitives |

## happy-dom Gotchas

| Issue | Workaround |
|-------|------------|
| DOMPurify executes inline scripts during sanitization | Use non-callable code in test fixtures (`var x = 1;` not `alert(1)`) |
| `querySelector` with CSS-escaped colons (`content\\:encoded`) works in happy-dom but fails in browsers | Use `getElementsByTagName` for XML namespace-prefixed elements |
| CDATA sections with namespace declarations may fail to parse | Use entity-escaped HTML (`&lt;p&gt;`) instead of `<![CDATA[<p>]]>` |
| `isContentEditable` may not behave identically to browsers | Dispatch keyboard events from the target element, not `document` |
| Radix UI `AlertDialog` renders curly quotes (`\u201C`/`\u201D`) for displayed strings | Use flexible regex matchers (e.g., `/Remove.*Feed Name/` not `/Remove "Feed Name"/`) |

## Adding New Tests

### For a new feature

1. Write unit tests for any new core module functions (pure logic)
2. Write store tests if a new Zustand store or action is added
3. Write component tests for new UI components
4. Add structural assertions if the feature introduces layout-critical CSS or ARIA requirements
5. Add E2E specs for user-facing flows that span multiple components

### For a bug fix

1. Write a failing test that reproduces the bug (RED step of RGR)
2. If the bug was a CSS class regression, add a structural assertion to prevent recurrence
3. If the bug was a user flow issue, add an E2E test

### For a refactor

1. Existing tests should continue to pass (no new tests needed unless behavior changes)
2. If refactoring changes DOM structure, update structural assertions

### For an API endpoint or adapter change (mandatory SMOKE)

Per [ADR 011](decisions/011-smoke-tests-in-rgr.md), every change to an API endpoint handler, adapter resolver, storage adapter, or `api/*.ts` wrapper must ship with a smoke test under `tests/smoke/`. The smoke test runs against the live deployed system after merge and catches the class of bug unit tests structurally cannot see.

## Tier 4 — SMOKE Tests

### What SMOKE asserts

System-level invariants that only become observable against the real deployed environment:

- **Real SDK behavior.** The Upstash sync adapter unit tests used a fake client that returned strings as-is; the real SDK auto-deserializes JSON strings into objects. The unit suite passed; production returned `"[object Object]"` for every vault GET. Caught by `tests/smoke/sync.test.ts` on first run.
- **Cross-lambda persistence.** `api/feed.ts` (proxy) and `api/catalog.ts` (reader) are separate Vercel Lambdas with separate memory. Unit tests run in a single process — "same instance" is the default. `tests/smoke/catalog.test.ts` triggers a proxy upsert then reads the catalog from the reader lambda; passes iff both lambdas share a real backend.
- **Config drift.** Production env vars can diverge from the code's assumptions. `tests/smoke/stats-sync.test.ts` asserts `vaults > 0`; would have caught the 2026-05-12 sync regression where production had a stale `SYNC_STORAGE` override the resolver didn't recognize.
- **Observability contract.** The `traceId` in error response bodies (per [ADR 009](decisions/009-observability-trace-id-pattern.md)) must survive the deployment-artifact pipeline. Smoke tests assert traceId is present in the live 4xx and 5xx response bodies.
- **Defensive paths.** 429s from the rate limiter, 400s on invalid Stripe signatures, 400s on invalid checkout priceIds, etc. — verified against the live endpoint, not a mock.

### What SMOKE does NOT assert

- Internal function return values (use Tier 1)
- Component rendering (use Tier 2/3)
- Per-user UI state (use Tier 3)
- **Success paths that mutate production state.** Don't issue a real license, don't create a real Stripe Checkout session, don't send valid signed Stripe webhooks. Smoke tests focus on the defensive paths and the read-side correctness.

### File structure

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/<name> (live)", () => {
  it("<system-level invariant>", async () => {
    // hit BASE_URL/api/... and assert
  }, 10_000); // generous timeout for network round trips
});
```

`@vitest-environment node` is required — happy-dom enforces CORS on `fetch`, which blocks cross-origin requests to `my.feedzero.app` from `localhost`. Node's native `fetch` doesn't.

`SMOKE_BASE_URL` is overridable so the same tests can run against staging / preview deployments.

### Running SMOKE tests

```bash
# Run all smoke tests against production
SMOKE_TESTS=1 npx vitest run tests/smoke/

# Run one specific endpoint's smoke test
SMOKE_TESTS=1 npx vitest run tests/smoke/sync.test.ts

# Run against a Vercel preview deploy
SMOKE_TESTS=1 SMOKE_BASE_URL=https://feedzero-pr-99-...vercel.app npx vitest run tests/smoke/
```

Smoke tests are **NOT** part of `npm test`. They require network access, consume real rate-limit budget, and their result depends on the state of external services.

### Existing smoke tests

| File | What it asserts |
|---|---|
| `tests/smoke/sync.test.ts` | PUT → GET → DELETE → GET 404 roundtrip with traceId observability |
| `tests/smoke/catalog.test.ts` | Cross-lambda persistence; count > 0; populated leaderboard |
| `tests/smoke/stats-sync.test.ts` | Vaults count > 0 (catches wrong-adapter regression) |
| `tests/smoke/license-verify.test.ts` | 401/400 + traceId on invalid input; 405 on non-POST |
| `tests/smoke/stripe-webhook.test.ts` | 400 + traceId on missing/malformed signature |
| `tests/smoke/checkout.test.ts` | 400 + traceId on invalid priceId / `javascript:` URL |
| `tests/smoke/health.test.ts` | 200 + `{ok:true}` |
| `tests/smoke/rate-limiter.test.ts` | 320-request burst → mix of 200s + 429s + Retry-After |
| `tests/smoke/release-feed.test.ts` | Live release feed parses against our parser |

### When SMOKE runs in the RGR cycle

Step 7 of the RGR+S cycle, after the PR has merged and Vercel has deployed. If the smoke test fails, **revert or roll forward with a fix immediately** — the PR isn't done until SMOKE passes against prod. "It passed CI" is not "it works in production".
