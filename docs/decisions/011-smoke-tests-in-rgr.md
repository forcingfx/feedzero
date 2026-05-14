# ADR 011: SMOKE Tests as a First-Class RGR Phase

## Status
Accepted (2026-05-14).

## Context

Two production-down bugs in the same week ([2026-05-12](../incidents/2026-05-12-sync-regression.md), [2026-05-14](../incidents/2026-05-14-stats-always-zero.md)) shared a category. Both shipped clean through CI. Both had 1900+ passing unit/integration tests. Both broke production silently:

- The 2026-05-12 bug: code was internally correct (resolver cascade worked as designed); production env had a stale `SYNC_STORAGE` override the code interpreted differently than the operator intended. Tests deleted that env var in `beforeEach` — they never exercised the production-shaped case.
- The 2026-05-14 bug: code was internally correct (in-memory `Map` worked as designed); production runtime is multi-instance stateless — each Vercel Lambda gets a fresh empty `Map`, and `api/feed.ts` (proxy) and `api/catalog.ts` (reader) are different lambdas. Tests run in a single process; "same instance" is the default, so the cross-lambda mismatch was invisible.

Both bugs lived at the boundary between **what the test environment assumes** and **what production actually is**. The test suite proved the *code* is correct; it cannot prove the *system* is correct. As Charity Majors puts it: *"You don't have it in production until you've verified it in production."*

A third bug landed during smoke-test backfill: PR #45's UpstashSyncAdapter used the SDK's default `automaticDeserialization: true`, which auto-parses JSON-shaped strings back into objects on GET. The handler then did `new Response(obj)` which renders to the literal `"[object Object]"`. **Every cloud-pull was silently corrupted for 24 hours.** Caught by the first run of the new `tests/smoke/sync.test.ts`, before users noticed.

The pattern: bugs at the code/system boundary are invisible to a test suite that runs in a single process with mocked adapters in <10 seconds.

## Decision

Add SMOKE as **step 7** of the RGR cycle, alongside RED, GREEN, REFACTOR, VERIFY, DOCUMENT. The full cycle is now **RGR+S** ("Red-Green-Refactor-Smoke").

### What a smoke test is

A test that:

1. Runs against the **live deployed production system** (or a staging clone). Not a dev server, not a mock.
2. Asserts **system-level invariants** the unit suite cannot check: real SDK behavior, cross-lambda persistence, config drift, observability wiring.
3. Lives in `tests/smoke/`. Each file declares `@vitest-environment node` so it runs outside happy-dom's CORS sandbox.
4. Is **skipped by default**. Runs only when `SMOKE_TESTS=1`:
   ```
   SMOKE_TESTS=1 npx vitest run tests/smoke/sync.test.ts
   ```
5. Honors the same anonymity floor as production logs — no raw IPs, no emails, no vault ciphertext echoed back.

### When SMOKE fires in the RGR cycle

After step 6 (DOCUMENT). The PR merges, Vercel deploys, then the smoke test runs against production. If it fails, the change isn't done — roll back or roll forward with a fix immediately.

### Required for which changes

Any change that affects:

- An API endpoint handler (`src/core/*/handler.ts`)
- An adapter resolver (`src/core/*/resolve-*.ts`)
- A storage adapter implementation
- A serverless entry-point wrapper (`api/*.ts`)
- The bundle / build artifacts

For pure-frontend changes (component CSS, store internals) the smoke step doesn't apply.

### What to assert vs. NOT assert

| Assert (smoke) | Don't assert (smoke) |
|---|---|
| Round-trip via the real SDK | Internal function return values |
| Cross-lambda state visibility | Component rendering (use E2E) |
| Module-load adapter labels | UI flows (use E2E) |
| Observability contract (traceId in 4xx + 5xx bodies) | Per-user state |
| Defensive paths (429s appear, invalid signatures rejected, invalid priceIds rejected) | Anything requiring real Stripe / license-issue side effects |
| Production environment posture (vaults > 0, catalog count > 0) | Specific count values (will drift) |

### What NOT to test

- **Success paths that mutate production state.** Don't issue a real license (would persist in prod KV). Don't create a real Stripe Checkout session (would clutter dashboard). Don't send valid Stripe webhook events (would corrupt the license store).
- **Things that require secrets.** Don't commit admin tokens or webhook secrets to smoke tests.
- **State after artifacts.** Clean up after yourself (sync test creates a sentinel vault → DELETEs it in `try/finally`).

## Required test file shape

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("production /api/<name> (live)", () => {
  it("<system-level invariant>", async () => {
    // ...
  }, 10_000); // generous timeout for network round trips
});
```

`@vitest-environment node` at the top is required — happy-dom enforces CORS on `fetch`, which blocks cross-origin requests to `my.feedzero.app` from `localhost`. Node's native `fetch` doesn't.

`SMOKE_BASE_URL` is overridable so the same tests work against staging / preview deployments.

## Smoke tests we shipped with this ADR

| File | What it asserts |
|---|---|
| `tests/smoke/sync.test.ts` | PUT → GET → DELETE → GET 404 roundtrip; traceId in 404 body |
| `tests/smoke/catalog.test.ts` | Cross-lambda persistence (proxy upserts → catalog reader); count > 0; popular leaderboard populated |
| `tests/smoke/stats-sync.test.ts` | Vaults count > 0 (catches stale-adapter regression) |
| `tests/smoke/license-verify.test.ts` | 401/400 + traceId on invalid input; 405 on non-POST |
| `tests/smoke/stripe-webhook.test.ts` | 400 + traceId on missing/malformed signature; 405 on non-POST |
| `tests/smoke/checkout.test.ts` | 400 + traceId on invalid priceId / `javascript:` URL; 405 on non-POST |
| `tests/smoke/health.test.ts` | 200 + `{ok:true}` + ISO timestamp |
| `tests/smoke/rate-limiter.test.ts` | 320-request burst → mix of 200s + 429s + Retry-After header; window resets |
| `tests/smoke/release-feed.test.ts` (pre-existing) | Live release feed parses against our parser |

## Why this isn't covered by E2E

Playwright E2E tests run against a dev server on port 3001 with mocked feed fixtures. They prove the *client* works against a *mocked* server. They don't touch production at all. Smoke is the inverse: server-side, real infra, no client.

## Consequences

- The 7 endpoints above now have post-deploy regression coverage. Any future change that breaks one of them — config drift, env-var rename, SDK upgrade, adapter swap — fails the smoke test on first run.
- `tests/smoke/` is the canonical place for production-shaped tests. CI does NOT run them automatically (they need real infra; they consume real rate-limit budget). A future step is to add an on-demand workflow that runs them after Vercel deploys via a `workflow_dispatch` trigger.
- Developers writing new endpoints have a defined obligation: ship a smoke test. The PR description checklist now includes "Post-merge: SMOKE_TESTS=1 ... passes against prod".
- CLAUDE.md's Development Workflow section now reads RGR+S throughout. Future Claude sessions inherit the rule automatically.

## Alternatives rejected

### "Run integration tests against a staging deployment in CI"
Same idea, more infrastructure. We don't have a permanent staging; Vercel preview deploys are per-PR and ephemeral. The current approach (smoke against production after merge) is the cheapest version of this.

### Synthetic monitoring service (Pingdom, Better Uptime)
Useful but covers only "is the endpoint up" — not the system invariants we care about (cross-lambda persistence, traceId observability, adapter mode). Worth adding later as a separate layer.

### Cover this in unit tests with a real Upstash test instance
Considered for some cases. Adds a test-environment dependency (real Upstash creds in CI) and slows tests significantly. The boundary problem returns: even a real Upstash test instance is in a single process / single run; multi-lambda invariants stay invisible.

### Skip it ("our test suite is good enough")
The two production-down bugs in one week (one of them silently breaking for six weeks) is the evidence against this option.

## References

- PR #48 (rate limiter + RGR→RGR+S workflow change)
- PR #49 (smoke test backfill + sync auto-deserialization bug it caught)
- `CLAUDE.md` § Development Workflow (now codifies RGR+S)
- `docs/incidents/2026-05-12-sync-regression.md`
- `docs/incidents/2026-05-14-stats-always-zero.md`
- `docs/testing-strategy.md` (now has SMOKE as the fourth tier)
