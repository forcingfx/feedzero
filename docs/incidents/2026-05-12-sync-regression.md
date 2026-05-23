# Incident: /api/sync returning 500 ENOENT for every PUT

## Metadata

- **Date:** 2026-05-12
- **Detected at:** ~16:00 UTC (kenkiller's Reddit report — actual onset ~14h prior)
- **Resolved at:** 2026-05-13 ~12:55 UTC
- **Duration:** ~14 hours of sustained failure (zero successful sync PUTs in production during the window)
- **Severity:** SEV2 — sync was completely broken for any user attempting to push a vault; read paths returned 200 stale (no new vaults could be added)
- **Detected by:** External user report (Reddit)
- **Author:** Founder (post-incident write-up 2026-05-14)
- **Reviewers:** _solo founder; reviewed by Claude as part of session 2026-05-14_

## Summary

PR W rewrote `api/sync.ts` from a bundled wrapper (which hardcoded `createVercelBlobAdapter()`) to a source-form wrapper calling `resolveAdapter()`. The new resolver read `process.env.SYNC_STORAGE` and, when the value wasn't exactly `"vercel-blob"`, fell through to the filesystem adapter — which can't `mkdir` in Vercel's read-only function FS. Production had a stale `SYNC_STORAGE` env var set Feb 4 (scoped Production only) that didn't match any switch case, so every PUT silently routed to filesystem and ENOENT-d on `mkdir 'data/vaults'`.

## User impact

- **All sync push attempts failed** for ~14h. The endpoint returned `HTTP 500 {"ok":false,"error":"Failed to write vault: ENOENT: no such file or directory, mkdir 'data/vaults'"}`.
- **Read paths kept working** because they were hitting the filesystem adapter's `get()` (which returns null instead of crashing on missing files) — but no new data could be written, so devices effectively couldn't cross-device sync.
- **One reported user** (kenkiller on Reddit). Unknown how many silent victims; the catalog had ~20 vaults at the time, so the affected population is small.
- **No user notification.** No status page existed.

## Timeline (UTC)

| Time | Event |
|---|---|
| 2026-05-12 ~02:00 | PR W (`#38`) merged. Vercel auto-deployed within ~2 min. First failing PUT in the Vercel runtime log shortly after. |
| 2026-05-12 ~02:02 | Every subsequent PUT /api/sync returns 500 ENOENT. No alerts fire (no monitoring on the metric). |
| 2026-05-12 ~16:00 | kenkiller posts on Reddit: "Sync error: Sync push failed (500): {...ENOENT...mkdir 'data/vaults'...}" |
| 2026-05-13 ~10:00 | Founder reads the report; opens session with Claude. |
| 2026-05-13 ~10:15 | Reproduced via `curl`. Vercel runtime logs confirm every PUT in the last hour returned 500. |
| 2026-05-13 ~10:30 | Decision: hotfix in two steps. **PR 1** auto-detect via `BLOB_READ_WRITE_TOKEN` (more robust than relying on `SYNC_STORAGE` exact-match). **PR 2** add module-load adapter logging that would have caught the regression on first deploy. |
| 2026-05-13 ~11:00 | PR #42 merged. Vercel deployed within ~3 min. **Production still 500-ing.** |
| 2026-05-13 ~11:30 | Investigation revealed: `BLOB_READ_WRITE_TOKEN` was set in the Vercel project env *but* flagged "Needs Attention" (integration disconnected); meanwhile a separate `SYNC_STORAGE` env var was set to a stale value that bypassed the new auto-detect cascade. |
| 2026-05-13 ~12:50 | User deleted the `SYNC_STORAGE` override from Vercel project settings. Vercel auto-redeployed. |
| 2026-05-13 ~12:55 | `curl PUT /api/sync` returned `HTTP 200 {"ok":true,"updatedAt":...}`. Production healthy again. |
| 2026-05-13 ~13:00 | PR #43 (observability foundations) drafted as the follow-up. Merged ~14:00. |

## Root cause

A code change in PR W silently shifted production behavior because the new resolver depended on an operator-set env var that nobody remembered existed, AND the resolver had a degraded silent-fallback path (filesystem) that was invalid for the production runtime.

Two layers of root cause:

1. **Test-runtime / production-runtime divergence.** The unit test for `resolveAdapter` (`tests/core/sync/adapters/resolve-adapter.test.ts`) deletes `process.env.SYNC_STORAGE` in `beforeEach`. It exercises the case where the env is absent, the case where it's set to a recognized value, and the case where it's set to an unknown value. The case it never covers is "the case Vercel actually has in production today" — because the test process doesn't see Vercel's env.

2. **Silent degraded-mode fallback.** `resolveAdapter` defaulted to filesystem when no recognized SYNC_STORAGE value matched. The filesystem adapter is valid for self-hosters and for local dev. It is invalid for Vercel Lambdas, where `/var/task` is read-only and `mkdir` fails. The resolver had no signal that "filesystem in Vercel is a misconfiguration" — it failed silently into a broken state.

## Resolution

In order of what actually fixed it:

1. **Hotfix PR #42** added `BLOB_READ_WRITE_TOKEN`-presence auto-detect as a fallback before filesystem. *Would have* recovered production if the BLOB token had been healthy. It wasn't — its Vercel-Blob integration was flagged "Needs Attention". So #42 deployed but production stayed broken.
2. **Operator action (15 min later):** deleted the stale `SYNC_STORAGE` env var from Vercel project settings. With it gone, `resolveAdapter` fell through to the `BLOB_READ_WRITE_TOKEN`-present branch from PR #42 and returned the Vercel Blob adapter. PUT succeeded.
3. **Follow-up PR #43** added module-load adapter logging (`[sync] adapter=<type>` printed at cold start) so this category of misconfiguration is visible from the first deploy log.

The deeper architectural fix — eliminating the Vercel Blob backend entirely and consolidating on Upstash — landed three days later in PR #45 (see ADR 008).

## Five whys

1. **Why did sync PUT 500?** — `mkdir 'data/vaults'` failed inside the filesystem adapter, which Vercel Lambdas can't write to.
2. **Why was the filesystem adapter chosen in production?** — `resolveAdapter` defaulted to filesystem because `SYNC_STORAGE` was set to a value that didn't match `"vercel-blob"` or `"memory"`.
3. **Why didn't tests catch this?** — Tests delete `SYNC_STORAGE` in `beforeEach`. The test environment never exercises "production env has a value the resolver doesn't recognize".
4. **Why didn't a deploy-time alert fire?** — There was no observability of the resolver's choice. The first signal that anything was wrong was a user report 14 hours after the breaking deploy.
5. **Why was no operator alert configured?** — The whole class of "wrong adapter resolved in production" had no signal because we'd never had a production-shape misconfiguration before. The bug exposed the gap.

## Prevention

| Action | Owner | Status |
|---|---|---|
| Add `BLOB_READ_WRITE_TOKEN`-presence auto-detect as a fallback rule in `resolveAdapter` (so `SYNC_STORAGE` typos no longer silently fall to filesystem) | Founder + Claude | ✅ PR #42 |
| Add module-load `console.log` line in `api/sync.ts` that surfaces the resolved adapter on cold start | Founder + Claude | ✅ PR #43 |
| Add traceId to all error responses + structured error log on 5xx so users can quote an id in support reports | Founder + Claude | ✅ PR #43 |
| Migrate sync off Vercel Blob entirely (consolidate on Upstash to eliminate the "two integrations to keep healthy" failure mode) | Founder + Claude | ✅ PR #45 / ADR 008 |
| Add post-deploy smoke tests for `/api/sync` that PUT, GET, DELETE a sentinel vault against production | Founder + Claude | ✅ PR #49 / ADR 011 |
| Make smoke tests a required phase of the RGR cycle so every future API change ships with one | Founder + Claude | ✅ PR #48 / CLAUDE.md RGR+S |
| Quarantine memory adapters as test fixtures (resolver should refuse them in `NODE_ENV=production`) | Founder + Claude | ✅ All four memory adapters (sync / catalog / license / stripe) branded test-only via `src/core/test-only-brand.ts`; resolvers assert and throw a loud module-load error when a branded adapter would be returned under `NODE_ENV=production` |
| Commit an `expected-env.json` listing required env-var *names*; CI compares against Vercel pulled env | Founder + Claude | ✅ `expected-env.json` + `scripts/check-env.ts`; `env-audit` job in CI enforces "every `process.env.X` has a one-line spec entry". Audit mode (`npm run check-env -- --env <file> --target production`) compares a `vercel env pull` snapshot against the spec. See `docs/operations/env-audit.md`. |

## What went well

- Local repro via `curl` took ~30 seconds.
- The fix path was clean: a non-destructive operator action (delete one env var) restored production without any code revert.
- The follow-up PR #43 (observability) was scoped tightly to the gap the incident revealed and shipped same-session.

## What went poorly

- **14 hours to detection.** No monitoring of "%-of-requests returning 5xx" or anything similar. A user found the bug before we did.
- **The first fix attempt (PR #42) didn't actually fix it.** The hotfix's logic was correct but the `BLOB_READ_WRITE_TOKEN` env var the auto-detect relied on was itself in a degraded "Needs Attention" state. We assumed the env was healthy because we'd never had reason to check.
- **Misleading partial diagnosis cost time.** Investigation hit several dead ends (assumed CORS, assumed Vercel build cache) before discovering the stale `SYNC_STORAGE` override existed at all. The whole class of "what env vars does production actually have right now" is invisible from the code.
- **No incident communication.** kenkiller never got a reply; affected users were not notified that the issue was fixed.

## Open questions

- How many silent victims were there beyond kenkiller? Catalog had ~20 vaults at time of incident, so the upper bound is small, but unknown.
- Should we have a public status page / `/status` URL? Currently no. Probably worth doing once paid tier is live.

## References

- Related PRs: [#38](https://github.com/forcingfx/feedzero/pull/38) (the breaking change), [#42](https://github.com/forcingfx/feedzero/pull/42) (hotfix), [#43](https://github.com/forcingfx/feedzero/pull/43) (observability), [#45](https://github.com/forcingfx/feedzero/pull/45) (Upstash migration), [#48](https://github.com/forcingfx/feedzero/pull/48) (RGR+S + rate limiter), [#49](https://github.com/forcingfx/feedzero/pull/49) (smoke test backfill)
- Related ADRs: [008](../decisions/008-upstash-as-production-data-layer.md), [009](../decisions/009-observability-trace-id-pattern.md), [011](../decisions/011-smoke-tests-in-rgr.md)
- Related runtime logs: Vercel deployment `dpl_DBc6RkUjHH8w9xW8BCi7zds7Eyz3` (the breaking deploy)
