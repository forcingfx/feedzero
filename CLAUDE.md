# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Overview

FeedZero is a privacy-first RSS reader for people who need their reading kept private — journalists, activists, and people living under surveillance. Feeds are fetched through a proxy, sanitized, and stored encrypted in the browser; optional sync stores only an encrypted vault server-side.

## Terminology

- **RGR+S** — Red-Green-Refactor-Smoke, the mandatory change sequence in [Development Workflow](#development-workflow).
- **Vault** — a user's encrypted sync blob, read and written through `/api/sync`.
- **Three entry points** — the consumers of every API handler: `server.ts` (Hono), `vite.config.js` (dev), `api/*.ts` (Vercel).
- **Tier matrix** — `src/core/features/tier-matrix.ts`, the single source of truth for which feature exists at which tier.
- **Pin-test** — a test that freezes a product decision rather than a correctness property.
- **Smoke test** — a `tests/smoke/` test that hits the live deployed system, run with `SMOKE_TESTS=1`.

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

React + TypeScript UI, Zustand state, React Router, Tailwind CSS v4. Core modules (`src/core/`, `src/utils/`) are framework-agnostic TypeScript with zero React/UI imports — they are the shared backend.

### Runtime Dependencies

- **UI**: React + React DOM (functional components only), React Router, Radix UI + shadcn/ui wrappers in `src/components/ui/` (Button, Dialog, AlertDialog, DropdownMenu, Sheet, Sidebar, etc. — use these, do not build from scratch), lucide-react icons, react-resizable-panels, sonner toasts (`<Toaster>` in `src/app.tsx`, trigger via `toast()`), next-themes, class-variance-authority, clsx + tailwind-merge via `cn()`.
- **State / storage**: Zustand (stores call core modules directly), Dexie.js (IndexedDB, encrypted).
- **Parsing / extraction**: feedsmith (RSS/Atom/JSON Feed + OPML), Defuddle (full-text extraction; pluggable), marked (markdown → HTML; always piped through DOMPurify), DOMPurify (XSS — do not hand-roll).
- **Server**: Hono (14kB, Web standard `Request/Response`; powers self-hosting via `server.ts`).

### Data Flow

Add feed: `feed-service.ts` (normalize, dedup) → `/api/feed` proxy → `validator.ts` → `parser.ts` → `sanitizer.ts` (DOMPurify) → `schema.ts` → `crypto.ts` (AES-GCM-256) → `db.ts` (Dexie) → Zustand → React → URL auto-selects new feed.

Full-text extraction (user-initiated): click "Extracted" → `/api/page` → `extractor.ts` → `defuddle-extractor.ts` → `cleanup.ts` → DOMPurify → cached in extraction store.

### Code Map — where things live

The file-level reference — every core module, Zustand store, React component, route, hook, styling token, and type, with its API and purpose — lives in **[docs/code-map.md](docs/code-map.md)**. Consult it to find where a capability lives or what a module exposes. The standing *rules* about these layers stay inline below in [Key Patterns](#key-patterns): core returns `Result` and imports no UI; URL is the source of truth for navigation; stable outer panel topology (ADR 013); etc. Conceptual views (dependency graph, encryption model, threat model) are in [docs/architecture.md](docs/architecture.md).

### Testing

Three-tier strategy. See [docs/testing-strategy.md](docs/testing-strategy.md) for the full guide.

**Tier 1 — Unit/Integration (Vitest + happy-dom)**: Core modules, stores, components, hooks. Tests mirror `src/` under `tests/`. `fake-indexeddb` for db tests; RTL + userEvent for components; store tests use `getState()`/`setState()` directly. Setup: `tests/setup.ts`.

**Tier 2 — Structural assertions (Vitest + RTL)**: Verify critical CSS classes (`overflow-hidden`, `min-h-0`, `h-svh`), ARIA, DOM composition. Catches regressions happy-dom can't see in computed styles.

**Tier 3 — E2E (Playwright + Chromium)**: Two viewports (`desktop` 1280×720, `mobile` Pixel 5). `tests/e2e/`, dev server on port 3001. A third project, `offline`, runs `offline.spec.ts` against a production build on port 3002, because the dev server ships no service worker. Feeds mocked via `page.route()` with `feed-fixtures.ts`. Onboarding bypassed via localStorage (`tests/e2e/fixtures.ts`). First-launch auto-subscribe to `https://feedzero.app/releases.xml` is best-effort (try/catch) so a network miss is silent.

**Coverage thresholds** (`npm run test:coverage`): Statements/Lines/Functions 90%; Branches 83%. Excluded: `src/workers/**`, `src/main.tsx`, `*.d.ts`, `src/types/**`, `src/core/extractor/adapters/types.ts`, `src/core/sync/types.ts`, `src/components/ui/**`.

**Rules** — the rationale, good/bad examples, and the Playwright, happy-dom and Vitest gotchas are in [docs/testing-strategy.md](docs/testing-strategy.md#working-rules-and-gotchas). Read that section before writing or debugging tests.

- **Test behavior, not implementation**: assert user-observable outcomes, not internal mechanisms. If a user action has multiple code paths (click + keyboard), test both.
- **Pin-tests must state their rationale**: a test that freezes a *product decision* names the trade-off it encodes, in a comment or the test name.
- **Component/page tests must NOT replace store methods with mocks** and assert on mock calls. Use real store methods; assert on rendered UI, URL, or resulting store state.
- **Mock at the boundary, not at the collaborator.** The boundary is the network, the filesystem, the system clock. Never mock `db.ts`, `key-manager.ts`, or the `sync-service` helpers; run store mutators against the real `db.ts` via `fake-indexeddb`. Templates: `tests/integration/feed-store-db.test.ts`, `tests/integration/sync-store-db.test.ts`.
- **Every client-server boundary needs a contract test.** When a mock replaces a real function at a system boundary, a separate contract test must verify both sides agree on the interface.
- **Smoke external services**: before deploying a feature that fetches externally, `curl` the real endpoint and verify the response matches your fixtures.
- **Caching**: new endpoints start with `Cache-Control: no-cache`; a "clear cache" action must clear ALL layers — in-memory, localStorage, and browser HTTP.
- **Unit tests stay off the network**: page code that calls `fetch` on mount needs `vi.stubGlobal("fetch", ...)` in its test.

### App Initialization Flow

`src/app.tsx` orchestrates startup via `AppInit`: new users get `<OnboardingModal>`; returning users go through `initializeReturningUser()` in `app-store.ts` (stored derived keys first, legacy passphrase fallback, vault pull for sync users); routes render once `isDbReady`. `<OnboardingModal>` and `<SyncSetupDialog>` mount at the top level alongside `<BrowserRouter>`, not inside routes. Step-by-step: [docs/architecture.md](docs/architecture.md#app-initialization-flow).

### CORS Proxy, Sync API & Server

All API handlers use the Web standard `Request → Response` pattern via shared handler functions (`proxy-handler.ts`, `sync-handler.ts`). Three entry points consume them:

- **`server.ts`** — Hono standalone for self-hosting (`npm run serve`). Mounts proxy + sync + static serving.
- **`api/*.ts`** — Vercel Serverless Functions. Source files are thin wrappers (~5-10 lines) that import from `src/core/`. The build script `scripts/build-api.js` overwrites them with self-contained esbuild bundles because **Vercel compiles each `.ts` individually without bundling cross-directory imports** (some `api/*.ts` in git may already contain bundled output — the build script overwrites regardless). See ADR 007.
- **`vite.config.js`** — Dev proxy with lazy-imported shared handlers + memory adapter for sync.

**Three-entry-point rule**: Every API endpoint has three consumers (Hono, Vite, Vercel). When changing request format, HTTP method, headers, or URL structure, all three MUST be updated. The Vercel `api/*.ts` wrappers MUST export a named function for every method the shared handler supports — enforced by routing contract tests in `server.test.ts`. Never deploy without verifying this.

**Endpoints**: `POST /api/feed` `{url}` (feed proxy), `POST /api/page` `{url}` (page proxy), `/api/sync` (GET/PUT/DELETE/HEAD encrypted vault), `GET /api/icon` (favicon proxy), `POST /api/feedback` (→ GitHub issue, requires `GITHUB_FEEDBACK_TOKEN` + `GITHUB_REPO`), `GET /api/stats-sync`.

**Sync storage** — Pluggable `SyncStorageAdapter`. Default: filesystem (`SYNC_STORAGE=filesystem`). Vercel: `SYNC_STORAGE=vercel-blob` + `BLOB_READ_WRITE_TOKEN`. Dev: memory.

### Security boundaries

SSRF protections — Proxy blocks internal/private IPs (localhost, 127.0.0.1, ::1, 10.x, 172.16–31.x, 192.168.x, 169.254.169.254) and only allows `http`/`https`. Do not weaken these.

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
8. **DEVICE** — For any change to touch gestures, viewport-dependent layout, or safe-area handling: verify on **real mobile hardware** via the PR's Vercel preview URL (a QR of the branch-alias URL makes this a 5-second loop). ⛔ Emulation is not sufficient — see [Gesture work](#gesture-work).

## Shipping: verify the outcome, not the action

**A command exiting 0 is not evidence that the thing you wanted is true.** Every failure of the 2026-09-05 pricing cutover lived in that gap: `git push` succeeded, `gh pr merge` succeeded, `tsc` was green — and the landing site served stale pricing for an hour because none of those facts were the fact that mattered.

⛔ **Never report a change as shipped until you have observed it in the deployed system.** Not the PR state, not the merge commit, not the CI badge.

| Change | The assertion that closes it |
| --- | --- |
| App deploy | `curl https://my.feedzero.app/api/health` shows the expected `commit` |
| Build-time env var (`VITE_*`) | fetch the deployed bundle, grep for the value |
| Server-side env var | call the endpoint and assert the behaviour it gates |
| Landing copy | `curl https://feedzero.app/<path>` and grep for the new string |
| Stripe change | read the object back and assert its fields |

### Repos and remotes

- **`git remote -v` in full. Never `| head`.** Both repos carried a stale `gitlab` remote for four months after the 2026-05-09 move to GitHub. A landing change was pushed and merged there — a remote nothing deploys from. The same applies to any command whose answer depends on seeing every line.
- **`feedzero.app` (landing) does not auto-deploy on push** unless the commit author email is one Vercel can resolve to a Git account. Use the account's GitHub noreply address; a personal address Vercel cannot match makes the deploy silently not happen. After pushing landing, confirm the live page.

### Pull requests

- **Sequential PRs off `main`. Never stacked.** This repo squash-merges, which deletes the base branch, auto-closes any PR stacked on it, and GitHub then refuses to reopen it once the head has been force-pushed. Land one, rebase the next onto `main`, open it then.
- **Open the PR yourself once the change is stable. Do not ask first.** This is the owner's standing request, so it counts as the explicit ask that agent harnesses otherwise wait for. Stable means: the RGR cycle is done, `npm test` and `npx tsc --noEmit` are green, the E2E specs the change touches pass (or fail identically on `main`), and the branch is pushed. Fill in `.github/pull_request_template.md` and leave unchecked, in plain words, anything only a human can do (the real-device check of step 8). This covers opening only: merging stays with the owner, and a change still mid-cycle gets no PR.

### Scripts and one-off tooling

- **Never hand over an executable you have not executed.** `scripts/` is type-checked by `tsconfig.scripts.json` (`npm run typecheck` covers both projects) precisely because `find-license.ts` shipped in PR #106 importing a path that has never existed, and crashed on startup for months. Type-clean is still not "runs" — run it.
- **Rehearse every live third-party write against that provider's test mode first.** The annual-plan migration was rejected twice by Stripe — nulls, then nulls nested inside `discounts` — on payloads that passed every unit test, because the fixtures were the documentation's minimal shape rather than what the API returns. A test-mode subscription carrying a coupon and metadata found both before a customer did. See `docs/operations/annual-plan-migration.md`.

## Smoke tests

Smoke tests in `tests/smoke/` run only when `SMOKE_TESTS=1`; they are **not** part of `npm test`. They hit real production URLs (`https://my.feedzero.app/api/*`) via `fetch`, honor `SMOKE_BASE_URL` for staging / preview environments, and assert system-level invariants the unit suite can't check. They must tolerate their own side effects (wait out a rate-limit window before asserting normal traffic works).

Do NOT assert unit-level behavior, UI rendering, or per-user state in a smoke test, and never log raw IPs, user emails, license tokens, or vault ciphertext — same anonymity floor as production logs. Details and examples: [docs/testing-strategy.md](docs/testing-strategy.md#tier-4--smoke-tests). Reference: `tests/smoke/release-feed.test.ts`, `tests/smoke/rate-limiter.test.ts`.

## Gesture work

Touch gestures have **three arbiters**, and you only get what the other two cede: the **OS** (screen edges, home indicator), the **browser** (scroll, back-swipe, pull-to-refresh), and **your JS**. Both mobile-UX rounds on 2026-08-01 shipped gestures that passed every local gate and failed on real glass.

- **Emulation cannot validate a gesture.** Synthetic `TouchEvent`s — from Vitest, and from Playwright/CDP in device emulation — bypass the browser's gesture recognizer entirely. They test *your* state machine; the thing that breaks is the *browser's*. Unit + emulation green means "not obviously wrong", never "works".
- **Declare `touch-action` or lose the race.** Without it, mobile browsers claim a drag as a native scroll after their own slop and stop dispatching `touchmove`; JS arming logic never runs. Use `touch-pan-y` for horizontal gestures on vertically scrolling surfaces, and re-enable `touch-auto` on descendants that legitimately pan (e.g. `<pre>` code blocks).
- **The screen edges are not yours.** Chrome and Safari run back-navigation gestures there. An edge-gated affordance is unreachable on device — arm on direction, not on origin.
- **`preventDefault` needs a non-passive native listener.** React's root touch handlers are passive, so `onTouchMove` cannot cancel browser panning; attach via `addEventListener(..., { passive: false })` in an effect.
- **Write the ownership map before the gesture.** Before building any interaction, state which surface owns which direction — and what the OS/browser already reserve. When a new gesture has no free direction, that's a signal the *layout* is wrong, not that the gesture needs cleverness: the snap-pager's claim on leftward swipes was the real defect behind an elaborately-arbitrated row swipe. Record the map in the relevant `docs/features/*` (`010-mobile-navigation.md` is the model).

## Operations

- **License support runbook** — `docs/operations/license-support.md`. The procedure for handling "I can't recover my license" support emails. Uses `scripts/find-license.ts` (operator CLI) backed by the pure library at `src/core/license/admin-find-license.ts`. Both reuse `findCustomerByEmail` from `src/core/stripe/find-customer-by-email.ts` so the recover-handler and the CLI agree on Stripe-customer lookup semantics.
- **Annual-plan migration runbook** — `docs/operations/annual-plan-migration.md`. The ADR 029 cutover to a single $9/year price: Stripe price creation, allowlist-before-deploy ordering, landing-then-app, then `scripts/migrate-to-annual-plan.ts` to move the existing book onto the annual price at each subscriber's next renewal. The CLI is dry-run by default and idempotent; its decisions live in `src/core/stripe/plan-migration.ts`, mirroring the `find-license.ts` / `admin-find-license.ts` shell-and-library split.
- **Quarterly architecture audit lap** — `docs/operations/audit-lap.md`. 90-minute recurring task; runs the test-suspicion detector + churn/size analytics + the structured eyeball pass, produces a 3-finding memo under `docs/reports/audit-YYYY-QQ.md`. Exists because four production incidents in one quarter (2026-05-12 sync, 2026-05-14 stats, 2026-05-19 destroy cascade, 2026-05-28 onboarding modal) shared a pattern that no per-PR review caught. ADR 025 names the pattern; the lap is the operational loop that catches the next instance.

## Auditing the codebase

For open-ended improvement requests ("level up the codebase", "review and find what to fix"), follow [docs/operations/audit-lap.md](docs/operations/audit-lap.md#open-ended-audit-requests). In short: map first and do not edit; write a ranked memo of three to seven findings before any code, and get it approved; ship one commit per finding, smallest-risk first; refuse to rewrite working modules because their style offends you.

## Commit Messages

Conventional commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`). Detailed bodies.

**Features**: what was added and why; list key files.

**Bug fixes** require four sections in the body:
1. **What** — observable symptom
2. **Why** — root cause
3. **Fix** — what changed
4. **Prevention** — tests, docs, or lint rules added

## Multi-agent hygiene

Two or more agents may run in parallel working trees. Uncommitted work is fragile — a `git reset --hard` from a co-located agent wipes it silently, and `git switch` carries uncommitted edits into branches they don't belong on.

### ⚠ Mandatory worktree rules (strict — no judgment calls)

The 2026-05-16 deeplink-hotfix incident proved that "I'll just stash and switch in the main tree" is unsafe even for one-file fixes. A branch switch during agent work intermingled hotfix edits with pre-existing WIP and took an hour to untangle. These rules exist so it can't happen again.

**ALWAYS create a worktree when ANY of these is true:**

1. `git status` shows ANY modified file or untracked file in the working tree that you didn't author this session.
2. You are about to work on a branch other than the one currently checked out, AND the current branch has uncommitted changes (yours or theirs).
3. Another agent may be operating in this repo (assume yes unless explicitly told otherwise).
4. The task is a hotfix that should ship independently of any in-progress feature work.
5. You expect to run a long-lived dev server, test watcher, or other process that would conflict with another agent's process on the same port.

**NEVER do any of these in the main working tree when the above triggers fire:**

- `git stash` + `git switch` to a different branch — the stash can be lost, popped wrong, or skipped silently. Forbidden as a substitute for a worktree.
- `git switch` to a different branch with uncommitted changes in the working tree, hoping git "carries them along compatibly." It might. It might also intermingle them with another branch's content.
- `git checkout <ref>` of any kind when you have uncommitted work — same failure mode as above.
- Run a hotfix and a feature in the same working tree by switching between branches.

**Create** — always from `origin/main` unless explicitly told otherwise: `git -C ~/builder/feedzero worktree add ~/builder/feedzero-wt-<slug> -b <branch-name> origin/main`, where `<slug>` is a 2–3 word kebab-case description of the work. **Announce the decision first**: state the trigger and the slug before running `worktree add`. Teardown, the `node_modules` symlink shortcut, and when to run `npm install` instead are in [docs/operations/worktrees.md](docs/operations/worktrees.md).

### Other multi-agent rules

- **Commit after every successful GREEN.** Small conventional commits; never batch unrelated RGR cycles. The reflog survives `reset --hard` for ~90 days; uncommitted work survives nothing.
- **Before any destructive git op** (`reset --hard`, `clean -fd`, `checkout .`, `stash drop`, force-push, branch delete): run `git status` and describe what you see. If there are modifications you did not author, stop and ask. Default to preserve, not clear.
- **Delegated subagents always isolate.** Pass `isolation: "worktree"` to the Agent tool for any task that touches the codebase. The runtime auto-creates and cleans up.
- **Releases are one PR in this repo.** `release-notes.mjs` here is the source of truth; `scripts/release/build-feed.mjs` emits `public/releases.xml` during the build, and landing *rewrites* `feedzero.app/releases.xml` to `my.feedzero.app/releases.xml` so the public URL and every entry id are unchanged for subscribers. The notes entry and the version bump land in the same commit, so there is no ordering to get right and nothing to poll — the landing-first rule this replaced cost the 0.13.0 release a polling loop, a preflight guard, and a window where the two repos disagreed. Landing's homepage (version string and accordion) is built from `my.feedzero.app/releases.json` at landing's deploy time; it never affects the feed, but it stays on the previous release until landing is redeployed, which is the last step of `/release`. **Never** re-add a static `releases.xml` to landing: Vercel matches the filesystem before rewrites, so the file would shadow the real feed.
- **Don't touch code you didn't author.** If `git status` shows files modified by another agent or pre-existing user WIP: don't stage, don't revert, don't include in your commits.
- **When splitting one uncommitted tree across multiple commits**, prefer `git add -p`. Create a safety stash (`git stash push -u && git stash apply`) first — but if the rules above triggered, use a worktree instead, not a stash split.
- **Stacked PRs + squash merges: retarget before merging the upper PR.** When PR B stacks on PR A's branch and A squash-merges into main, A's branch is dead — its history never reaches main. Merging B into that branch strands B's entire diff silently (the 2026-08-02 batch-2 incident: 1.7k lines marked "merged" that never landed; rescued by #245). Rule: after the lower PR merges, retarget the upper PR's base to main and let its checks re-run BEFORE merging it. Never merge a PR whose base is not main unless you are deliberately extending a still-open stack. The merge queue only accepts main-based PRs, which enforces this structurally.
- **`npm audit` advisories are triaged, not repo-freezing.** The `npm audit + gitleaks` required check runs `scripts/audit-gate.mjs`: high/critical production advisories fail the gate unless `audit-exceptions.json` carries a dated waiver (advisory id + expiry + reason). Triage flow: new advisory → daily scheduled run files a `security-audit` issue → either fix the dependency or add a waiver with an expiry that forces re-triage. Never waive without a reason naming why the app is unaffected.
- **`gh pr create` after a branch operation must use `--head <branch>` explicitly.** gh defaults to the current branch and that can shift if a parallel command swaps it mid-flight (lesson from the deeplink-hotfix incident).

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

The working code-review checklist — general, design, names, functions, comments, structure, objects and data structures, tests, and the code-smell vocabulary — is in [docs/clean-code.md](docs/clean-code.md). Apply it whenever you review or refactor.

### Key Patterns

One-line rules. The rationale, incident history and code templates for each are in [docs/key-patterns.md](docs/key-patterns.md) — read the matching entry before touching that area.

- All core functions return `Result<T>` — never throw for expected errors.
- UI components are functional React with hooks — no classes.
- State lives in Zustand stores — components subscribe to slices.
- URL is the source of truth for navigation state.
- Core (`src/core/`) and stores (`src/stores/`) have zero React/UI imports and never import from `src/components/`.
- Sanitization delegated to DOMPurify — `dangerouslySetInnerHTML` only for pre-sanitized content.
- TypeScript strict — no `any` except in type declarations for untyped libs.
- IndexedDB stores encrypted content + HMAC-hashed index fields (no plaintext metadata exposed).
- Feed detection tries JSON parse first (JSON Feed), then XML (RSS/Atom). XML namespace-prefixed elements (`content:encoded`, `dc:creator`) must use `getElementsByTagName`, never `querySelector`.
- **Key-data coupling invariant**: stored derived keys (`feedzero:derived-keys`) must always decrypt local IndexedDB data. Only `open(passphrase)` and `importAll()` may break the coupling; when changing sync mode, persist the in-memory keys with `exportCurrentKeys()`. `assertKeyDataCoupling()` closes every key-touching flow.
- **Pull-before-mutate invariant**: fetch remote state (`pullVault()`) **before** any destructive local op (`deleteDatabase`, `tryDeleteServerVault`).
- **No-auto-destroy invariant**: no automated code path may delete server-side vault data. `destroy()` has exactly one sanctioned caller — `useAppStore.getState().resetApp`, behind an explicit user-confirmation UI. Boot-time canary failures route to `recoveryMode: "invalid-keys"`. See ADR 018.
- **API handlers answer JSON on every path; clients never treat an unparseable body as a network error.** Narrow untrusted payload fields to their expected type (`readTrimmedString`); only a rejected `fetch` may say "check your connection".
- **Never share a mutable headers object across responses** — `@hono/node-server` appends `Content-Length` to it. Use a function returning a fresh object, as `apiHeaders()` does.
- **Test-only adapters are branded** with `markTestOnly()`; every resolver calls `assertNotTestOnlyInProduction()`. New backends MUST follow the same pattern.
- **Gate every gated capability at BOTH layers** (store and UI), with copy derived from the matrix. `src/core/features/tier-matrix.ts` is the single source of truth for gates, quotas, gate messaging and pricing bullets — never hand-edit those for tier changes. Feature gating is honor-system open-core (ADR 012); do not add server-side gates without an ADR naming the privacy cost.
- **Price copy has one home**: `PAID_PLAN` in `src/core/features/pricing.ts` — never a literal. See ADR 029.
- **Apply `normalizeTier` at every boundary** that reads a tier from outside the app. Dropping it downgrades a paying customer to Free.
- **Do NOT clear a starred article's offline copy.** `src/core/storage/release-offline-content.ts` owns the keep/release rule; user-facing copy about a full vault must name one of its two levers. See ADR 032.
- **Operational logging takes no identities**: only `logError` and `logEvent`, sizes as power-of-two buckets, nothing tying a line to a vault. See ADR 032.
- **Sync push bodies are gzipped in transit**: signal it with `x-feedzero-body-encoding`, never `Content-Encoding: gzip`; pad with base64, not hex; cap decoding at `MAX_VAULT_SIZE`; pass request bodies through as bytes, never `Buffer.toString()`. See ADR 031.
- **Every `db.ts` operation goes through `ctx.op((db) => …)`**; the only exception is `replaceTablesAtomically`. See ADR 030.
- **The service worker handles three things and nothing else**: the app page (network-first, stored copy only when offline), hashed `/assets/` (cache-first), and the icons and manifest. It must never handle `/api/*`, other origins, or non-GET requests, and `/sw.js` is served `no-cache`. See ADR 033.
- **Prefer static imports of in-tree modules at file top.** A dynamic `import()` followed by a named-export destructure is a build error (`INEFFECTIVE_DYNAMIC_IMPORT`).
- **Design defaults**: route by router, not by flag; orchestrate boot in store actions, not component effects; reach for a DOM `CustomEvent` last (`useNavigate` / URL params → props → context first); extract a helper when the same multi-step dance repeats; split a big file when the next investment is committed, not before; put the highest-quality source first in a fallback chain; trace the full request path with real data before deploying.

---

**Visual changes must be visually verified** in a real browser — not just by checking class names in unit tests. Use Playwright screenshots or the dev server.

**Red-Green-Refactor. No test, no code. No refactor, no commit. No mock without a contract. No deployment without verification.**

**Mock at the boundary, not the collaborator. Route by router, not by flag. Orchestrate in stores, not in components. Extract helpers to make omissions visible.**

**FeedZero protects people. Act accordingly.**
