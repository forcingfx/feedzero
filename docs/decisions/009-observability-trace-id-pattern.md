# ADR 009: traceId in Error Responses + Allow-list Structured Logger

## Status
Accepted (2026-05-12).

## Context

The 2026-05-12 sync regression took 14 hours to diagnose. The failing endpoint was returning a generic `{ok:false, error:"..."}` response with no way to correlate a user's report to a specific lambda invocation. The first signal that something was wrong was a Reddit post by user `kenkiller`. By the time we saw it, hundreds of failed PUTs had occurred — there was no way to identify which lambda instances had failed or to look up the structured runtime log for the exact request the user hit.

Two gaps:

1. **No request identity in error responses.** A user reporting "sync failed" gives us a class of failure but not the instance. We'd need to grep Vercel logs by timestamp and hope.
2. **No structured server-side logging.** The proxy and sync handlers either threw silently or `console.log`-d unstructured strings. Vercel's runtime log UI is text-grep-only on those; pulling out a single error's full context took manual eyeballing of the request log.

Anonymity floor constraint: FeedZero deliberately doesn't log raw IPs, User-Agents, vaultIds, customer IDs, emails, license tokens, or vault ciphertext. Any observability layer must work within that.

## Decision

### 1. `traceId` minted at handler entry, returned in error body

Every shared handler in the monetization stack (sync, license/verify, license/issue, stripe/webhook, checkout/create-session) calls `newTraceId()` at request entry:

```ts
// src/utils/trace-id.ts
export function newTraceId(): string {
  return "req_" + crypto.randomUUID().split("-")[0]; // "req_<8 hex chars>"
}
```

- 8 hex chars = ~4 billion possibilities. Collisions across a year of traffic are negligible; even a collision is harmless (worst case: two requests share an id, one grep returns two results).
- Opaque random. No correlation across requests. Each request gets a fresh id.
- `req_` prefix matches the `cli_` prefix used by the rate limiter (ADR 010) — operators can grep both in one query.

The handler includes `traceId` in **every non-2xx response body**:

```json
{"ok": false, "error": "Vault not found", "traceId": "req_a1b2c3d4"}
```

Users who hit an error see the `traceId` in their app's error toast (Phase 1+ UX touch). They paste it into a support report. We grep Vercel logs for the exact id.

### 2. Allow-list structured logger

Every 5xx path also writes a single-line JSON to the server log via `logError()`:

```ts
// src/utils/log-error.ts
export interface ErrorLogFields {
  route: string;       // "/api/sync"
  method: string;      // "PUT"
  status: number;      // 500
  traceId: string;     // "req_a1b2c3d4"
  errClass: string;    // "AdapterPutFailed"
  errMsg: string;      // sanitized — caller's responsibility to not leak PII
}
```

The TypeScript interface **is the allow-list**. At runtime, `logError` picks only the known fields into the JSON payload — anything else (including `// @ts-expect-error`-bypassed extras) is dropped. The unit test `tests/core/utils/log-error.test.ts` pins this: attempting to log `vaultId`, `customerId`, `email`, `ip`, or `token` fails type-check AND runtime drops the value even if the type is bypassed.

The output is single-line JSON so Vercel's runtime-log filter UI can parse and grep it cleanly:

```
{"route":"/api/sync","method":"PUT","status":500,"traceId":"req_a1b2c3d4","errClass":"AdapterPutFailed","errMsg":"ENOENT: ...","ts":"2026-05-12T..."}
```

### 3. 4xx vs 5xx split

- **5xx paths** call `logError` AND include `traceId` in the body. These are ops-actionable.
- **4xx paths** include `traceId` in the body but do NOT log. Client errors aren't actionable for ops; logging them inflates the error log.

### 4. Module-load adapter logs

Each `api/*.ts` source-form wrapper writes one log line at module load:

```
[sync] adapter=upstash license-storage=upstash
[stripe] license-storage=upstash event-store=upstash
[catalog] storage=upstash
[feed-proxy] catalog=upstash ratelimit=upstash
```

Implemented via `describeAdapterMode()` / `describeLicenseStorageMode()` / etc. helpers in each resolver. The helpers consult the same env-var cascade the actual resolvers use, so the label and the actual adapter cannot drift. Test pins this invariant.

This single log line at module load would have caught the 2026-05-12 sync regression in seconds (the first Vercel deploy after PR W would have surfaced `adapter=filesystem` when production needed `vercel-blob`). It's a 1-line config that pays for itself the first time it fires.

## Why an allow-list, not a deny-list

A deny-list ("don't log these PII fields") is one slipped-PR away from being wrong. A new field gets added to an error log, nobody updates the deny-list, PII ships to runtime logs. The allow-list inverts: by default *nothing* is logged; only the six pinned fields make it through. A new field requires an explicit interface change with a code-review checkpoint.

## Anonymity floor

The structured log carries no PII. Fields and their content:

| Field | Content | Risk assessment |
|---|---|---|
| `route` | Static string like `/api/sync` | None |
| `method` | HTTP method | None |
| `status` | Integer | None |
| `traceId` | `req_<8 hex>`, random per request | None — no input correlation |
| `errClass` | Free-form short string (e.g. `AdapterPutFailed`) | Caller-controlled; reviewed via tests + code review |
| `errMsg` | Sanitized error message | Caller-controlled; floor is *don't include vaultId in the message* |

The same floor applies to module-load logs (they only emit adapter labels — strings the operator already knows).

## Consequences

- Every monetization handler now has uniform error-response shape: `{ok: false, error, traceId}`. Existing tests that asserted the shape were extended; existing client code didn't care because the new `traceId` field is purely additive.
- The 4 byte traceId is small enough to be quoted by humans without copy-paste pain.
- Module-load logs are visible in the Vercel runtime log UI under the cold-start row of any lambda — first place an operator looks during an incident.
- Smoke tests (ADR 011) assert `traceId` is present in error response bodies. The observability contract is verified against production on every deploy.

## Alternatives rejected

### Sentry / Datadog / external observability
Considered but deferred (per `docs/internal/strategy.md` §10.7). Adds an external dependency, a privacy review surface (IP-correlation by default), and a non-zero monthly cost. The `traceId` + `console.error` pattern lands the user-correlation benefit with zero infrastructure.

### W3C `traceparent` header
Standard but overkill. We don't have a distributed system; we have ~6 lambdas. The standard header carries a span-id, parent-span-id, and flags — useful for service meshes, noise for our shape. A simple opaque id is enough.

### Raw error logging with redaction filter
Allow-list (this ADR) vs. log-everything-then-redact: the latter is one regex away from missing a leak. Allow-list is fail-safe by design.

## References

- PR #43 (Observability foundations)
- `src/utils/trace-id.ts`, `src/utils/log-error.ts`
- `tests/core/utils/log-error.test.ts` — pins the allow-list contract
- `tests/smoke/*.test.ts` — pins the response-body shape against production
- `docs/incidents/2026-05-12-sync-regression.md` — the incident that motivated this
