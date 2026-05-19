# Incident: Self-hosted sync truncated GETs cascaded to silent vault deletion

## Metadata

- **Date:** 2026-05-19 (user-reported)
- **Detected at:** 2026-05-17 23:46 UTC (issue #117 filed by founder
  on behalf of self-hoster DoubtfulYeti592)
- **Resolved at:** 2026-05-19 (this PR)
- **Severity:** SEV3 — self-hosted only at time of report; latent SEV2
  for paid users on Upstash (silent ticking risk, see "Cross-cutting
  impact" below)
- **Detected by:** External user report. Self-hoster on a Caddy +
  filesystem-adapter deployment observed JSON parse errors on
  refresh and, after a page reload, the encrypted vault file
  `~/feedzero/data/vaults/{vaultId}.json` was gone.
- **Author:** Claude (this session)

## Summary

Three latent bugs in the same control path produced a cascade that
ended in the user's encrypted cloud vault being deleted by their own
client at boot, with no warning:

1. **HTTP response truncation.** `src/core/sync/sync-handler.ts`
   shared one `const API_HEADERS = {...}` object across every
   `new Response(body, { headers: API_HEADERS })` call.
   `@hono/node-server@2.0.2` MUTATES the supplied headers record by
   appending the computed `Content-Length`. A small PUT response
   (`{"ok":true,"updatedAt":<ms>}` = exactly 37 bytes) ran first,
   stamped `Content-Length: 37` onto the shared object, and the
   subsequent GET inherited it. The GET response body (an encrypted
   vault, potentially MBs) was cut off at byte 37 on the wire. This
   was the literal source of the user's
   `JSON.parse: unterminated string at column 1476496` reports —
   except the column number was misleading; the actual truncation
   was at byte 37, and the column was wherever the JSON parser ran
   out of bytes inside a quoted string field. The pattern: every
   torn body was *exactly* `Content-Length-of-previous-response`
   bytes long.

2. **Auto-destroy on canary failure.** `src/stores/app-store.ts`'s
   `initializeReturningUser` called `destroy()` whenever
   `restore()` returned non-`ready`. `destroy()` deletes the local
   IndexedDB AND issues a DELETE against the server vault via
   `tryDeleteServerVault()`. The comment at `app-store.ts:42-46`
   already flagged this as a known landmine ("catastrophic data
   loss masked as 'sync didn't work'") but the cascade existed in
   code and fired in production.

3. **Rekey didn't rekey.** `rekeyFromPassphrase` JSDoc claimed to
   "re-derive all keys from a passphrase AND re-open the DB." The
   implementation only wrote JWKs to localStorage; in-memory DB
   keys stayed stale. After `switchToExistingCloud("replace")`, the
   local DB held data encrypted under OLD keys while localStorage
   held NEW keys. On the next page load, `restore()`'s canary check
   (`getFeeds()`) failed → bug #2 fired → server vault deleted.

The self-hoster's user-facing chain was:

- Day N: device A pushes vault, all working.
- Day N+1: device B logs in via the recovery flow. Pull succeeds.
  Sidebar stays empty (a separate UX bug in `applyCloudVault` /
  switchToExistingCloud not refreshing in-memory feed store).
- User presses `r` to refresh. `refreshAll` calls `syncStore.pull`,
  which does GET `/api/sync`. The response is truncated by bug #1.
  `JSON.parse` throws → `Sync pull failed: JSON.parse: ...`.
- User refreshes the page. `initializeReturningUser` runs
  `restore`. Recovery flow had quietly drifted key/data state via
  bug #3 (or, in the self-host case, the same response truncation
  fed a corrupted vault into IndexedDB and the canary failed
  for that reason). Bug #2 fires → `destroy()` → server DELETE +
  local DB wipe.
- "No cloud data found for this passphrase" on both devices.

## User impact

- **One reported self-hoster** (issue #117). Unknown silent victims —
  likely zero for the paid-tier variant because the cascade requires
  a second-device login via DeviceSetupWizard `replace` mode, and
  we have few paid second-device logins in production so far. But
  the failure mode is "silent vault deletion," which is the worst
  possible outcome category for a privacy-first app.
- **Cross-cutting platform exposure:** bugs #2 and #3 affect paid
  users on Upstash exactly as they affect self-hosters. The
  `destroy()` DELETE is just an adapter call; the Upstash adapter
  faithfully deletes the key. Every paid user logging in on a new
  device hit the broken `switchToExistingCloud("replace")` path
  pre-fix. Bug #1 was self-host-only (the header-leak requires the
  long-running Hono process; Vercel lambdas are per-request).

## Timeline (UTC)

| Time | Event |
|---|---|
| 2026-05-17 22:27 | DoubtfulYeti592 (via issue #111) reports a TLS issue with Caddy. Resolved by user (#113). |
| 2026-05-17 23:46 | Issue #117 filed — "Sync pull failed: JSON.parse: unexpected end of data". |
| 2026-05-18 16:03 | User adds a comment confirming the vault file deletes itself from the filesystem. This is the data-loss escalation. |
| 2026-05-19 (this session) | Investigation, root cause identified in three layers, fix landed. |

## Root cause analysis (5 whys)

**Why did the self-hoster's vault get deleted?**
Because `tryDeleteServerVault()` was called from `destroy()` from
the boot-time `initializeReturningUser` path.

**Why did initializeReturningUser call destroy?**
Because the canary check (`getFeeds()` in `restore()`) returned an
error, which the code interpreted as "invalid keys → wipe and
restart."

**Why did the canary fail when the user's data was actually intact?**
Because the user's `r`-refresh hit a torn HTTP response from
`/api/sync` (37 bytes instead of multi-KB), which fed corrupted
ciphertext into `importVault` → encryption failures → canary
mismatches. (For paid users hitting this same control path via
`switchToExistingCloud("replace")`, the canary fails because of
bug #3's key/data drift, not bug #1's response truncation. Same
final cascade either way.)

**Why was the HTTP response torn?**
Because `@hono/node-server@2.0.2` mutates the headers object
supplied to `new Response`, and the sync handler shared one
`const API_HEADERS` across every response. The first response's
`Content-Length` leaked into the second response.

**Why didn't tests catch any of this?**
- The header leak requires *cross-request* state in a single
  long-running Hono process. Unit tests run one request at a time;
  Vercel runs per-request lambdas (no shared state). The smoke
  tests in `tests/smoke/sync.test.ts` did sequential PUT → GET
  roundtrips against production, which on Vercel happens to never
  exercise the leak. The bug only showed up in self-host
  (long-running Hono process). The 2026-05-12 incident already
  documented this gap; this is the third instance.
- The destroy cascade had a test (`app-store.test.ts`'s "forces
  re-onboarding when keys are invalid") that asserted
  `destroy` was called — verifying the bug as a feature.
- The rekey drift was caught by no test. The JSDoc claimed
  "re-opens the DB" but the implementation didn't, and no test
  exercised the full "rekey → close → openWithKeys" cycle.

## Fix

Single PR landing all of:

1. `apiHeaders()` function returning a fresh object per response in
   `src/core/sync/sync-handler.ts`. Unit-level regression test in
   `tests/core/sync/sync-handler.test.ts` ("PUT then GET produce
   responses with independent header objects"). Smoke-level
   regression test in `tests/smoke/sync-concurrent-clients.test.ts`
   (runs the Hono server with a filesystem adapter and asserts no
   torn bodies across N parallel clients).
2. Atomic write in `src/core/sync/adapters/filesystem-adapter.ts`
   via tmp + rename. This wasn't the proximate cause of #117, but
   it closes a latent multi-process race that would surface as soon
   as anyone ran multiple Hono processes against a shared volume.
3. Concurrency contract docstrings in
   `src/core/sync/types.ts:SyncStorageAdapter` plus a shared
   conformance suite at
   `tests/core/sync/adapters/concurrency-contract.test.ts` that
   every adapter must pass. See ADR 017.
4. Refuse auto-destroy at boot in `src/stores/app-store.ts`. The
   `initializeReturningUser` path now surfaces
   `recoveryMode: "invalid-keys"` instead of calling `destroy()`.
   See ADR 018.
5. Recovery UI screen
   `src/components/recovery/invalid-keys-screen.tsx` with explicit
   "Restore from cloud" and "Wipe and start over" buttons.
   AlertDialog confirmation gates the destructive path. Unit tests
   at `tests/components/recovery/invalid-keys-screen.test.tsx`
   assert `resetApp` is NOT called until the confirmation button
   fires.
6. Delete `rekeyFromPassphrase` (rename to
   `persistDerivedKeysFromOpenDb` with explicit precondition in
   JSDoc). Consolidate the `importVault → rekey` ordering into one
   `applyCloudVault` helper that does pull → close → delete → open
   → import → persist → assertKeyDataCoupling →
   loadFeeds/preloadAll. Both `switchToExistingCloud` branches
   become thin wrappers.
7. Add `assertKeyDataCoupling()` at the end of every key-touching
   flow. Mechanically enforces CLAUDE.md's "key-data coupling"
   invariant.

## Prevention

- Added in this PR:
  - Three new tests that would have caught the cascade (one per
    layer).
  - ADR 017 establishes the adapter concurrency contract.
  - ADR 018 establishes the "no automated server-vault DELETE"
    rule and the runtime invariant assertion.
  - CLAUDE.md updated: new invariant "No automated code path may
    delete server-side vault data. Vault deletion requires an
    explicit user confirmation flow."
- The shared-mutable-state-via-`const`-object pattern is now a
  visible smell — this incident and ADR 017 are the canonical
  reference when reviewing a PR that adds another shared headers
  / options / config object across requests.
- The next adapter (S3, Postgres, D1) must pass
  `concurrency-contract.test.ts` before merging. The conformance
  suite registers each adapter explicitly, so adding a new one
  without registering it is a deliberate-not-accidental omission.

## Related

- Issue [#117](https://github.com/forcingfx/feedzero/issues/117)
- ADR [017: Adapter concurrency
  contract](../decisions/017-adapter-concurrency-contract.md)
- ADR [018: No automated server-vault
  delete](../decisions/018-no-auto-destroy.md)
- Incident
  [2026-05-12-sync-regression.md](./2026-05-12-sync-regression.md)
  — the prior incident in the same "unit-green but system-wrong"
  family.
- Incident
  [2026-05-14-stats-always-zero.md](./2026-05-14-stats-always-zero.md)
  — the second one.
