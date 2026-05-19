# ADR 017: Encode SyncStorageAdapter Concurrency Contract

## Status
Accepted (2026-05-19).

## Context

[Issue #117](https://github.com/forcingfx/feedzero/issues/117) surfaced as
`JSON.parse: unterminated string at column N` on a self-hosted FeedZero
deployment. Investigation found a deeper structural problem the symptom
only partially revealed: the `SyncStorageAdapter` interface
(`src/core/sync/types.ts`) had four atomic-looking methods (`get`,
`put`, `delete`, `count`) and no documented concurrency guarantees.
Three of the four implementations got atomicity for free from their
backends — Memory's `Map.set` is single-shot, Upstash `SET` is atomic
on the Redis side, Vercel Blob's `put` finalizes via S3 multipart
atomicity. The fourth — `filesystem-adapter` — used `fs.writeFileSync`,
which **truncates then writes**. The concurrency contract the interface
implied was never actually verified for the only implementation that
couldn't get it for free.

The smoke test that closes this gap
(`tests/smoke/sync-concurrent-clients.test.ts`) also exposed a separate
but adjacent bug: the sync handler shared one `const API_HEADERS` object
across every `new Response(body, { headers: API_HEADERS })` call, and
`@hono/node-server@2.0.2` mutates that record by appending the computed
`Content-Length`. A small PUT response (~37 bytes:
`{"ok":true,"updatedAt":<ms>}`) stamped `Content-Length: 37` onto the
shared object, and the next GET response inherited it — truncating the
encrypted vault body at byte 37 on the wire. That truncation was the
literal source of the user's `JSON.parse` errors. The filesystem
adapter's lack of atomicity was a real-but-latent risk; the
header-leak was the proximate cause. Both ship in this fix.

Both bugs were invisible to the unit suite because both depend on
*cross-request* state in a long-running process. Unit tests run one
request at a time in a single Node process with fresh module state.
The 2026-05-12 and 2026-05-14 incidents (ADR 008, 011) had already
established that this gap exists. Issue #117 is the third incident in
the family, which is why we're treating it structurally.

## Decision

### 1. Concurrency contract becomes part of the interface

`SyncStorageAdapter` in `src/core/sync/types.ts` now carries explicit
JSDoc invariants:

- **Atomicity** — `put(id, data)` must be atomic relative to concurrent
  `get(id)`. A reader either sees the previous value or the new value,
  never a partial / torn write.
- **Idempotency** — `delete(id)` of a missing key returns `ok`, not
  `err`.

The invariants reference the conformance suite. Any future adapter
that lands without these properties is a regression vector.

### 2. Conformance suite is mandatory for every adapter

`tests/core/sync/adapters/concurrency-contract.test.ts` defines a
`testAdapterContract(name, factory)` function and invokes it for the
memory and filesystem adapters. Adding a new adapter (e.g. S3 direct,
Postgres, Cloudflare D1) requires registering it in this file.

The suite covers:

- `get` returns `ok(null)` for unknown ids
- `put` then `get` is byte-equal
- `put` is idempotent across overwrites
- `delete` is idempotent for missing keys
- No observer sees a torn body across N parallel writers and readers
- `count` reflects only completed writes (no in-flight tmp files)

Upstash and Vercel Blob conformance is exercised by the existing
production-facing smoke tests (they need live credentials) rather
than the unit suite, but the same contract applies.

### 3. Filesystem adapter writes are now atomic via tmp + rename

`src/core/sync/adapters/filesystem-adapter.ts` writes to
`{vaultsDir}/.tmp-{pid}-{random}-{vaultId}` with `flag: 'wx'` (fail if
exists), then `fs.renameSync` onto the destination. Same-directory
rename is atomic on POSIX. Concurrent readers see either the old
inode or the new one — never the half-written tmp.

Orphan tmp files (left by a crashed write) are ignored by `count()`
and overwritten on the next `put` to the same vault id. The
`flag: 'wx'` ensures we never silently reuse a stale tmp from a prior
crashed process with the same pid + random collision (astronomically
unlikely, but explicit failure is preferable).

### 4. Sync handler builds fresh headers per response

`src/core/sync/sync-handler.ts` replaces the shared `const API_HEADERS`
with `apiHeaders()` — a function returning a new object on every call.
Two consecutive responses never share a headers reference, so
`@hono/node-server`'s `Content-Length` mutation can't leak between
them. This change is the surgical fix for the user-visible symptom of
issue #117. A regression test in `tests/core/sync/sync-handler.test.ts`
("PUT then GET produce responses with independent header objects")
asserts the invariant directly at the unit level — independent of the
node-server bug, this is just good hygiene.

## Consequences

- Every future adapter passes the same battery, in CI, before merging.
- The filesystem adapter is safe under multi-process self-hosting
  (the original deployment shape) and against external readers (`cat`,
  log shippers, backup scripts).
- The `apiHeaders()` change costs O(1) object allocation per response
  — negligible compared to fetch / JSON parse.
- The shared-mutable-state-by-reference pattern is now visibly wrong
  in code review: see this ADR. Future code that re-introduces a
  shared headers `const` is at minimum a code-smell flag.

## Related

- Issue [#117](https://github.com/forcingfx/feedzero/issues/117) —
  user report.
- Incident
  [2026-05-19-sync-cascade.md](../incidents/2026-05-19-sync-cascade.md)
  — full post-mortem, including the chain of three bugs the
  investigation exposed (header leak, auto-destroy cascade, rekey
  drift).
- ADR [018](./018-no-auto-destroy.md) — the separate "no automated
  code path may delete the server vault" decision that handles the
  data-loss half of #117.
- ADR [011](./011-smoke-tests-in-rgr.md) — establishes SMOKE as a
  RGR phase. This ADR adds a new smoke test
  (`tests/smoke/sync-concurrent-clients.test.ts`) under that umbrella.
