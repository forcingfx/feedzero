# Incident: Production-bundle boot crash via dynamic-import-of-same-chunk module

## Metadata

- **Date:** 2026-05-23 (user-reported)
- **Detected at:** 2026-05-23 ~17:00 UTC (user screenshot from
  iPhone Safari hitting the PR #180 Vercel preview)
- **Resolved at:** 2026-05-23 ~17:25 UTC (commit `70e8d92` on PR
  #180, merged as `323b372`)
- **Severity:** SEV1 — total boot outage for every user not running
  an already-warm session. New users hit a hard "Failed to
  initialize" screen with only a destructive "Reset App" affordance;
  returning users on a new device or a refreshed tab silently hung
  on "Loading…" forever. The only path the user is offered out of
  the failure state is the one that destroys their local data.
- **Detected by:** External user report. A FleetView session
  attached to PR #180 was shared on iPhone Safari; the user opened
  the preview, hit the failure screen, and forwarded a screenshot.
- **Author:** Claude (this session)

## Summary

`src/stores/preferences-store.ts`'s `propagateToStores` helper used
dynamic `import("./feed-store.ts")` + `import("./article-store.ts")`
+ `import("./app-store.ts")` and destructured `useFeedStore`,
`useArticleStore`, `useAppStore` from the resolved modules. Under
Vite/Rollup's chunk graph for recent main builds, `app-store.ts`
got bundled into the **entry chunk** (`index-*.js`), and the entry
chunk does NOT re-export source-name properties — it only re-exports
minified aliases (`R as D`, etc.) used by static importers. The
dynamic-import promise resolved fine, but the destructure
`const { useAppStore } = aps` came back **undefined**. The next line
called `useAppStore.setState({ groupArticleFloods: ... })`, which
threw `Cannot read properties of undefined (reading 'setState')` —
or, in Safari/WebKit's minified form, the user-visible
`undefined is not an object (evaluating 'i.setState')`.

`propagateToStores` is called from `usePreferencesStore.hydrate()`,
which is called from BOTH boot paths in `app-store.ts`:

- `initialize()` (new-user path) is invoked inside a try/catch in
  `startNewUserOnboarding`. The thrown exception was caught and
  rendered as the visible "Failed to initialize: undefined is not
  an object (evaluating 'i.setState')" screen.
- `initializeReturningUser()` (returning-user path) is NOT wrapped
  in a try/catch. The unhandled rejection meant `set({ isDbReady:
  true })` (line 208) never fired and the app stayed stuck on
  "Loading…" with no error message.

Both paths break for every prod-build hit. The only users who don't
notice are ones whose tabs remained open (already-hydrated) since
before the regression went live.

## User impact

- **Every fresh visit to the affected prod bundle.** New users
  reach the destructive recovery screen on first paint. Returning
  users on a new device / new browser / refreshed tab see an
  infinite loading state. Privacy-first product, so the only
  obvious next move ("Reset App") destroys the user's local
  encrypted data and may issue server-vault deletion if a sync
  vault exists. Combined with the 2026-05-19 cascade post-fix, the
  destroy path now requires confirmation, but the UX of "the app
  greets you with a red error and a destructive red button" is
  itself a failure mode.
- **Production-deploy exposure** depends on which prod build is
  currently serving `my.feedzero.app`. The bug reproduces from a
  freshly-built `origin/main` (commit `0d9470e`, pre-#178), so any
  prod build cut from main since the chunk topology tipped is
  affected. Prod's Vercel deploy log will confirm scope; this
  post-mortem assumes prod is affected and treats it accordingly.
- **No data loss attributable to this bug directly.** Boot crashes
  before any user action. Risk path: a user mashes "Reset App" to
  escape the failure → triggers the user-confirmed destroy flow.
  No reports of that escalation yet, but the affordance was
  uncomfortably close.

## Timeline (UTC)

| Time | Event |
|---|---|
| 2025-11 → 2026-05 | Multiple PRs gradually shifted the Rollup chunk graph (new stores, new shadcn primitives, removed primitives). Each individually fine; the cumulative effect put `app-store.ts` in the entry chunk. |
| 2026-05-22 ~ 15:29 | PR #178 merges; the test-only-brand module + four resolver guards land. Does not introduce the bug, but its module additions shift chunk boundaries enough that returning-user boot manifestation may have tipped past the threshold for some chunk topologies. |
| 2026-05-23 ~ 15:30 | PR #180 (this branch) merges main into the feature branch; the same chunk topology is now in the PR's preview build. |
| 2026-05-23 ~ 17:00 | User opens PR #180 preview on iPhone Safari. Sees "Failed to initialize…" screen. Sends screenshot. |
| 2026-05-23 ~ 17:00 → 17:25 | Investigation: instrumented build, headless chromium repro, bisect against `origin/main` and pre-#178 commit (both crash), root cause in preferences-store's dynamic-import + destructure pattern. |
| 2026-05-23 ~ 17:25 | Fix landed: static imports replace dynamic imports in `preferences-store.ts`. Commit `70e8d92` pushed to PR #180. |

## Root cause analysis (5 whys)

**Why did the app fail to boot?**
Because `usePreferencesStore.hydrate()` rejected with
`Cannot read properties of undefined (reading 'setState')` and both
boot paths in `app-store.ts` depend on `hydrate()` completing.

**Why did hydrate reject?**
Because `propagateToStores(prefs)` accessed `useAppStore.setState(...)`
and `useAppStore` was `undefined`.

**Why was `useAppStore` undefined?**
Because `const { useAppStore } = await import("./app-store.ts")`
returned a Module object whose `useAppStore` property did not exist.

**Why did the dynamic import return a module without `useAppStore`?**
Because Rollup bundled `app-store.ts` into the entry chunk
(`index-*.js`). The entry chunk's export list contains only the
minified aliases needed by static importers
(`export { ..., R as D, ... }`); it does NOT contain a namespace
object exposing the source module's named exports
(`useAppStore: () => R`). Other chunks did expose namespace objects
for the modules they contained (`feed-store-*.js` has
`xn = e({ useFeedStore: () => $, ... })` and
`rn = e({ useArticleStore: () => G, ... })`), so the dynamic imports
of feed-store and article-store happened to work; only app-store —
specifically because Rollup chose the entry chunk for it — was
broken.

**Why didn't a test catch this?**
Three layers of test gap, each separately fixable:

1. **No production-bundle boot test.** The unit suite (3,000+ tests)
   runs against the source modules under `happy-dom`, never against
   the built artifacts under a real browser. Dev mode also worked
   fine — Vite's dev server returns ES modules untouched, so the
   `import("./app-store.ts")` returned a real Module object with
   `useAppStore` defined. The bug was only visible in the built
   bundle that Vercel and self-hosters serve.
2. **No smoke test against `my.feedzero.app`** that asserts a
   successful boot. The smoke suite under `tests/smoke/` covers
   sync, license, stats, rate-limiting — every backend boundary
   except the most fundamental one: "the app loads."
3. **No lint / build rule against dynamic-import-then-destructure
   of project modules.** Vite emitted an
   `INEFFECTIVE_DYNAMIC_IMPORT` warning every build, naming
   `article-store.ts` specifically, but the warning's verbiage is
   about "module won't move to another chunk" — it doesn't predict
   "destructure will fail." The warning was visible in CI logs and
   was ignored.

## Fix

Single-file change in `src/stores/preferences-store.ts`:

- Replace the three dynamic imports + destructure with static
  imports at the top of the file.
- `propagateToStores` becomes a sync function (the only `await`s
  were the dynamic imports).
- `hydrate()` and `reload()` call `propagateToStores(prefs)`
  without `await`.

The original "Lazy imports avoid a boot-time cycle" comment was
addressing a circular concern: `preferences-store` is imported by
`app-store`, and `app-store`'s `useAppStore` is now imported by
`preferences-store`. JavaScript handles this cycle correctly
because both modules only access each other's exports inside
function bodies (`propagateToStores` and `hydrate` are runtime
callees), not during module evaluation. The cycle is harmless.

Commit `70e8d92` on PR #180, 21 insertions / 10 deletions, merged
to main as part of `323b372`.

## Prevention

The single-file fix shipped immediately in PR #180. The deeper
prevention work — tests, build assertions, lint rule, doctrine —
is the scope of the follow-up PR that lands alongside this
post-mortem. See "Related" below.

- **Production-bundle boot smoke test.**
  `tests/smoke/boot.test.ts` (gated by `SMOKE_TESTS=1`) hits
  `SMOKE_BASE_URL` (default `https://my.feedzero.app`), spawns a
  headless chromium, loads `/`, asserts the page reaches a known
  DOM state ("Open command palette" button visible) within N
  seconds, and asserts the destructive "Reset App" screen is NOT
  visible. CI runs it post-deploy.
- **`INEFFECTIVE_DYNAMIC_IMPORT` treated as a build error.** Vite's
  `build.rollupOptions.onwarn` filter promotes that specific
  warning code to a thrown error so the build fails before a deploy
  can ship the broken bundle. The two existing warning sites
  (`src/core/storage/crypto.ts` and `src/stores/article-store.ts`)
  are cleaned up in the same PR so the build stays green.
- **CLAUDE.md addition.** A new principle in the "Key Patterns"
  section: *"Prefer static imports of in-tree modules at file top,
  even when the existing code uses a dynamic import for code-split
  reasons. Dynamic `import('./foo.ts')` followed by named-export
  destructure is brittle — Rollup's chunk-graph decisions can move
  the target into a parent chunk that doesn't expose source-name
  properties, and the destructure silently returns `undefined`.
  Cycles where modules only touch each other at runtime (inside
  function bodies) are safe in JavaScript."*

## Why the prior incident family didn't prevent this

The 2026-05-12 sync regression, 2026-05-14 stats-always-zero, and
2026-05-19 sync cascade all carried the same lesson: *unit-green
does not mean system-correct; the only test that catches
production failures is one that exercises the deployed binary.*
The remediation for that pattern was the smoke-test suite under
`tests/smoke/`, the SMOKE step in RGR+S, and the test-only-brand
work in PR #178.

That remediation worked for the cases it was designed for —
silently-swapped backend adapters. It did NOT cover the case where
**the binary itself fails to boot before any backend boundary is
reached**. Smoke tests assume the app is running; they probe
endpoints. The app crashing during init is a class earlier than
"backend behaves wrong." This incident is the fourth member of the
unit-green-system-wrong family and the first one whose failure
mode is "page never loads."

## Related

- PR [#180 — high-impact features +
  fix](https://github.com/forcingfx/feedzero/pull/180), commit
  [`70e8d92`](https://github.com/forcingfx/feedzero/commit/70e8d92),
  merged to main as
  [`323b372`](https://github.com/forcingfx/feedzero/commit/323b372).
- PR #178 — test-only adapter branding. Not the proximate cause
  (bisect confirmed bug pre-dates merge), but the chunk-boundary
  shift it introduced likely tipped the manifestation threshold.
- PR #158 — UserPreferences type and constants. Introduced
  `preferences-store.ts` with the dynamic-import + destructure
  pattern. Latent since this merge; manifestation depended on
  whichever chunk Rollup placed `app-store.ts` into, which has
  shifted multiple times since.
- Incidents
  [2026-05-12-sync-regression.md](./2026-05-12-sync-regression.md),
  [2026-05-14-stats-always-zero.md](./2026-05-14-stats-always-zero.md),
  [2026-05-19-sync-cascade.md](./2026-05-19-sync-cascade.md) —
  the prior three "unit-green but system-wrong" cases. This is
  the fourth; the prevention work needs to cover boot, not just
  endpoint behaviour.
