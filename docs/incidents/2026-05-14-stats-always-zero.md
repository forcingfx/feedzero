# Incident: /stats page showed "0 feeds tracked" since v0.3.0

## Metadata

- **Date:** 2026-05-14 (bug discovered; live silently since v0.3.0 shipped ~6 weeks earlier)
- **Detected at:** 2026-05-14 (founder noticed stats page numbers were always zero, asked about relaxing rules)
- **Resolved at:** 2026-05-14 ~07:39 UTC (PR #47 merged + deployed)
- **Duration:** ~6 weeks of silent dysfunction. Zero functional days of the catalog.
- **Severity:** SEV3 — single feature broken; no data loss; no impact on core RSS-reading flow.
- **Detected by:** Founder noticed the stats page always showed zero; asked Claude about it.
- **Author:** Founder (post-incident write-up 2026-05-14)
- **Reviewers:** _solo founder; reviewed by Claude as part of session 2026-05-14_

## Summary

`api/catalog.ts` was using `createMemoryCatalogAdapter()` — an in-memory `Map` that resets on every Vercel Lambda cold-start. Each `api/*.ts` file is a separate lambda, so `api/feed.ts` (proxy that upserts) and `api/catalog.ts` (reader) never shared memory. The catalog had no persistence layer at all. Every proxy fetch incremented an in-memory counter that evaporated within the lambda's idle window (~15 min). The stats page at `/stats` consequently showed `0 feeds tracked`, `0` for every requestCount, and an empty leaderboard — for the entire lifetime of v0.3.0.

A related, independent bug: `api/stats-sync.ts` hardcoded `createVercelBlobAdapter()`, so after PR #45's Upstash sync migration, the Vaults stat queried an empty Vercel Blob bucket and returned 0. Same surface (the stats page), separate root cause.

## User impact

- **Public `/stats` page** showed zero for every metric the entire time. No actionable signal for users who visited the page.
- **Catalog leaderboard** never populated. Feature value (recommendations / "popular feeds") was zero.
- **No data integrity issue** — the catalog never *lost* data because there was never any data to lose. Every requestCount started at zero on every cold start and went back to zero ~15 min later.
- **No user complaints in 6 weeks.** This is itself a signal: nobody was relying on the stats page enough to notice.

## Timeline (UTC)

| Time | Event |
|---|---|
| ~6 weeks prior | `f19b66a` ("feat: v0.3.0 — anonymous feed catalog") shipped with `createMemoryCatalogAdapter()` as the production default. No alert. |
| 2026-05-13 | PR #45 migrated sync vault storage to Upstash. `/api/stats-sync` was untouched and continued to query the (now-empty) Vercel Blob bucket — Vaults stat began reading 0 in addition to the catalog always-zero state. |
| 2026-05-14 ~09:00 | Founder asked Claude: "the feed stats always show zero for the feeds tracked. why and can we relax the rules?" |
| 2026-05-14 ~09:20 | Diagnosis: no privacy floor to relax. Two architecture bugs: (a) catalog is in-memory and cross-lambda-invisible; (b) stats-sync queries the wrong storage backend. |
| 2026-05-14 ~09:35 | PR #47 drafted: new `UpstashCatalogAdapter` + `resolveCatalogStorage` cascade; api/catalog.ts and api/feed.ts source-form rewrites passing the catalog adapter properly. Sweeps stats-sync into the same fix. |
| 2026-05-14 ~07:39 | PR #47 merged (note: the timestamps are in UTC; the local-time order is correct). Vercel auto-deployed. |
| 2026-05-14 ~07:42 | Verified via curl: `/api/catalog?action=count` returned 28 within ~2 min of the deploy as real user traffic started landing upserts. |

## Root cause

Two co-located bugs, same architectural shape:

1. **In-memory catalog adapter as the production resolver default.** `src/core/catalog/adapters/memory-adapter.ts` was reachable from `api/catalog.ts` with no env-var gate — it was the only choice. Each Vercel Lambda gets a fresh `Map` on cold start; `api/feed.ts` and `api/catalog.ts` are separate lambdas. The cross-lambda invariant ("the proxy's writes are visible to the stats reader") was structurally impossible to maintain with memory storage, but no code or comment said so.

2. **Hardcoded `createVercelBlobAdapter()` in `api/stats-sync.ts`.** Independent of the catalog issue. When PR #45 moved sync to Upstash, the stats-sync endpoint kept asking the wrong backend. It would have returned 0 since 2026-05-13 even if the catalog had been working.

The shared shape with the 2026-05-12 incident: **test doubles are reachable as production defaults**. Memory adapters live in the same `adapters/` directory as real adapters; resolvers can return them; there's no `NODE_ENV=production` gate. The "fallback to memory" path looks safe in tests because the test environment is single-process; it's invalid in any multi-instance production deployment.

## Resolution

PR #47 (one merge):

1. New `src/core/catalog/adapters/upstash-adapter.ts` — persistent catalog on Upstash KV (`catalog:feed:<url>` keys + `catalog:ranking` sorted set for O(log N) inserts and O(top-K) reads).
2. New `src/core/catalog/resolve-catalog-storage.ts` — env-driven cascade (Upstash if creds present, memory fallback for dev).
3. Source-form rewrites of `api/catalog.ts`, `api/feed.ts`, `api/stats-sync.ts`:
   - `api/catalog.ts` calls `resolveCatalogStorage()`.
   - `api/feed.ts` passes the catalog adapter to `handleProxyRequest` (it wasn't passing one at all before, so even with a persistent backend the proxy's writes would have gone nowhere).
   - `api/stats-sync.ts` calls `resolveAdapter()` so it queries the live sync backend (post-PR-#45 that's Upstash).
4. Each `api/*.ts` ships a `console.log("[catalog] storage=upstash")` etc. module-load line (per ADR 009) so a regression to memory mode is visible in the first Vercel deploy log.

## Five whys

1. **Why did stats show zero?** — Catalog data wasn't persisted across lambda invocations.
2. **Why wasn't it persisted?** — `api/catalog.ts` used `createMemoryCatalogAdapter()`, which is an in-memory `Map`.
3. **Why did the production resolver choose memory?** — There was no resolver. The api/catalog.ts wrapper hardcoded the memory adapter. No env-var cascade, no fallback warning, no signal.
4. **Why was this missed in code review?** — Memory adapters look identical to real adapters at the type level. They satisfy `CatalogStorageAdapter`. Nothing in the type system or directory structure flags them as test-only.
5. **Why didn't tests catch it?** — Unit tests exercise the memory adapter in a single process where the Map is consistent across all calls. Cross-lambda invisibility is invisible in single-process land. (See ADR 011 — this is exactly the gap smoke tests close.)

## Prevention

| Action | Owner | Status |
|---|---|---|
| New `UpstashCatalogAdapter` + `resolveCatalogStorage` cascade | Founder + Claude | ✅ PR #47 |
| Source-form rewrite of `api/catalog.ts`, `api/feed.ts`, `api/stats-sync.ts` so they all use the env-driven cascade | Founder + Claude | ✅ PR #47 |
| Module-load `[catalog] storage=<type>` log in each `api/*.ts` so a regression to memory in production is visible at cold start | Founder + Claude | ✅ PR #47 |
| Smoke test that triggers a proxy fetch then asserts the catalog count grew (cross-lambda persistence regression test) | Founder + Claude | ✅ PR #49 (`tests/smoke/catalog.test.ts`) |
| Smoke test that asserts `/api/stats-sync` returns `vaults > 0` (catches the wrong-adapter regression) | Founder + Claude | ✅ PR #49 (`tests/smoke/stats-sync.test.ts`) |
| Add SMOKE as a required phase of the RGR cycle so every future API change ships with one | Founder + Claude | ✅ PR #48 / CLAUDE.md RGR+S |
| Move test-only adapters out of `src/core/*/adapters/` into `src/test-utils/` (or annotate `@testOnly` and have resolvers refuse them in production) | Founder | 🔄 Open follow-up (ADR 011 references this as next step) |

## What went well

- Diagnosis was fast: ~20 min from the founder's question to a clear two-bug analysis. The architecture had been correctly named; nobody had connected the dots.
- The fix had a clean shipping path because the Upstash adapter pattern was already established for license storage (PR U) and sync (PR #45). The catalog migration is the third in the same pattern; the muscle memory was there.
- Post-deploy verification was immediate: catalog count went from 0 to >0 within minutes of real user traffic landing.

## What went poorly

- **6 weeks of silent dysfunction.** This is the worst impact metric. The feature was always-broken from ship.
- **No production smoke test for the stats page.** A 30-line script that loaded `/stats` and asserted `count > 0` would have caught this on day 1 of v0.3.0.
- **The bug shape is the same as 2026-05-12.** Both incidents are "test doubles reachable as production defaults". Two production-down events in one week from the same architectural smell.

## Open questions

- Should the architecture forbid in-memory adapters in production at the *type* level (e.g. brand them with a `__testOnly` symbol the resolver refuses to return when `NODE_ENV === "production"`)? Open follow-up.

## References

- Related PRs: [#47](https://github.com/forcingfx/feedzero/pull/47) (persistent catalog + the fix), [#45](https://github.com/forcingfx/feedzero/pull/45) (Upstash sync migration that orthogonally broke stats-sync), [#48](https://github.com/forcingfx/feedzero/pull/48) (RGR+S workflow change), [#49](https://github.com/forcingfx/feedzero/pull/49) (smoke test backfill)
- Related ADRs: [008](../decisions/008-upstash-as-production-data-layer.md), [011](../decisions/011-smoke-tests-in-rgr.md)
- Related: 2026-05-12 sync regression — same bug class, same week, same root architectural shape
