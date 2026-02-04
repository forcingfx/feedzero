# Testing Strategy

## Overview

FeedZero uses a three-tier testing strategy to catch regressions at different levels of abstraction:

1. **Unit/Integration tests** (Vitest + happy-dom) — Fast, isolated tests for core modules, stores, and component behavior
2. **Structural assertion tests** (Vitest + React Testing Library) — Verify critical CSS classes, ARIA attributes, and component composition in rendered output
3. **E2E tests** (Playwright + Chromium) — Exercise the full app in real desktop and mobile browser viewports

## Test Pyramid

```
           ┌──────────────┐
           │   E2E Tests   │  9 spec files, 56 tests
           │  (Playwright)  │  Real browser, desktop + mobile
           ├───────────────┤
           │  Structural    │  7 test files, ~57 tests
           │  Assertions    │  CSS classes, ARIA, DOM composition
           ├───────────────┤
           │  Unit /        │  ~50 test files, ~500+ tests
           │  Integration   │  Core modules, stores, components
           └───────────────┘
```

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
