# Incident: sync fails with "Attempt to get records from database without an in-progress transaction"

## Metadata

- **Date:** 2026-09-21 (user-reported)
- **Severity:** SEV2 — intermittent sync failure. Sync parks in
  `status: "error"` showing a raw IndexedDB message, and because
  `pull()` flushes a pending push before importing, a failed read can
  block pulls as well. No data is lost on the reported path, but see
  **Silent variant** below for the one that can lose a write.
- **Detected by:** External user report, immediately after the
  unrelated 413 payload fix in the same session.
- **Author:** Claude (this session)

## Summary

The user saw:

```
Sync error: Failed to read all encrypted data: Attempt to get records
from database without an in-progress transaction
UnknownError: Attempt to get records from database without an
in-progress transaction
```

`Failed to read all encrypted data` is `getAllDecrypted` in
`src/core/storage/db.ts`; the inner text is Gecko's wording for
"this IndexedDB request was issued against a transaction that is no
longer running."

Dexie tracks "the transaction I am currently inside" in a zone that
follows promise continuations. That zone is not private to the code
that opened the transaction. A promise belonging to entirely unrelated
work, if it resumes while an explicit `db.transaction()` is running,
inherits it, and its next Dexie call silently joins a transaction it
never asked for.

That is fatal in this app because every read decrypts and every write
encrypts. IndexedDB commits a transaction as soon as the event loop
turns with no request outstanding, and `await crypto.subtle…` is
exactly such a turn. The bystander joins the transaction, the
transaction commits under it, and its next call lands on a finished
transaction.

The app has exactly one explicit transaction: the atomic table
replacement inside `importAll`, which is the sync pull path. That is
why this only ever appeared as a sync error. Nothing is wrong with the
import itself; the casualty is always some other operation that
happened to be in flight, which is also why it is intermittent and why
no test caught it.

## Timeline

1. User reports the error text.
2. `getAllDecrypted` identified as the thrower, from the wrapper message.
3. Probe against a real Dexie 4.4.5 instance under fake-indexeddb:
   a plain `await table.get()` does **not** leak its zone, and a
   transaction does not leak into its caller's continuation — so the
   obvious suspects were ruled out.
4. Probe with a bystander promise resolved from *inside* a running
   transaction: `Dexie.currentTransaction` is truthy in the bystander,
   and its second read fails with `TransactionInactiveError`
   (fake-indexeddb's wording for what Firefox reports as the
   `UnknownError` above). Reproduced.
5. Same probe with `Dexie.ignoreTransaction` around each call: passes,
   including a read of a table the ambient transaction never covered.

## Root cause

Every Dexie call in `db.ts` used the ambient transaction zone by
default. `Table._trans` starts with `var trans = this._tx || PSD.trans`,
so any call made while a transaction is ambient joins it rather than
opening its own.

## Silent variant

The reported symptom is a read failing. A write can bleed the same way:
a concurrent `addFeed`/`addArticles` that joins the import transaction
and executes *before* its `clear()` calls has its rows wiped by the
import it accidentally enrolled in, with no error anywhere. No report
of this exists, but it is the same defect and the same fix closes it.

## Fix

`src/core/storage/dexie-zone.ts` exports `ownTransaction`, which runs
one Dexie call inside `Dexie.ignoreTransaction` so it always opens its
own transaction. `requireOpen()` now hands callers a `ctx.op(...)`
accessor that routes through it, and every operation in `db.ts` goes
through that accessor.

The one deliberate exception is `replaceTablesAtomically` (extracted
from `importAll`): its calls belong to the transaction it opens, and
isolating them would defeat the atomicity the sync import depends on.

## Prevention

- `tests/core/storage/dexie-zone.test.ts` reproduces the bleed
  deterministically and pins that the wrapper is the difference between
  working and failing.
- `tests/core/storage/db-zone-discipline.test.ts` asserts structurally
  that every Dexie operation in `db.ts` is isolated, with
  `replaceTablesAtomically` as the single documented exception. A
  behavioural test cannot hold this rule: a new unisolated function
  would pass every test in the suite and fail only for whichever user
  happened to be syncing at the wrong moment.
- ADR 030 records the rule.

## What this says about the codebase

The 2026-05 incidents were about contracts between modules going
unverified. This one is about a contract with a *library*: Dexie's zone
is ambient state, and ambient state is inherited by code that never
asked for it. The lesson generalises past Dexie — when a library keeps
"where am I" in a global, every entry point into that library needs to
state where it is explicitly.
