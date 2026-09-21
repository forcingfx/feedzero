# ADR 030: Every Dexie Operation Opens Its Own Transaction

## Status
Accepted (2026-09-21).

## Context

A user reported sync failing with:

```
Failed to read all encrypted data: Attempt to get records from database
without an in-progress transaction
```

Dexie keeps "the transaction I am currently inside" in a zone (its PSD)
that follows promise continuations, and `Table._trans` begins with
`var trans = this._tx || PSD.trans`. The zone is ambient: a promise
belonging to unrelated work that resumes while an explicit
`db.transaction()` is running inherits it, and the next Dexie call on
that continuation joins a transaction it never asked for.

Two properties of this codebase turn that from a curiosity into a bug:

1. **Every read decrypts and every write encrypts.** IndexedDB commits
   a transaction as soon as the event loop turns with no request
   outstanding, and `await crypto.subtle…` is such a turn. An
   uninvited guest therefore joins a transaction that is about to
   commit out from under it.
2. **One explicit transaction exists** — the atomic table replacement
   in `importAll`, on the sync pull path — and it runs precisely when
   other database work is in flight (a debounced push's export, a
   refresh, a store reload). So the collision is not rare, it is
   scheduled.

The casualty is never the transaction's owner. It is whichever
operation happened to resume inside the zone, which is why the failure
is intermittent, why it always surfaced as a *sync* error, and why the
test suite never saw it. See
`docs/incidents/2026-09-21-dexie-transaction-zone-bleed.md`.

## Decision

**No Dexie operation in `src/core/storage/db.ts` may inherit an ambient
transaction. Every call opens its own.**

`src/core/storage/dexie-zone.ts` exports `ownTransaction(op)`, a thin
wrapper over `Dexie.ignoreTransaction` (a no-op when nothing is
ambient, so it is free on the normal path). `requireOpen()` returns a
`ctx.op((db) => …)` accessor that routes through it, and `ctx.db` is no
longer used directly anywhere outside the one exception.

**The exception is `replaceTablesAtomically`**, the extracted body of
`importAll`'s transaction. Its calls must join the transaction it
opens — isolating them would defeat the atomicity that the sync import
depends on (ADR 017's sibling property on the client side). It is a
single named function so the exception is visible rather than
scattered.

## Consequences

- A new `db.ts` function that reaches for `ctx.db` instead of `ctx.op`
  reintroduces the bug. `tests/core/storage/db-zone-discipline.test.ts`
  fails the build when it does. The check matches any receiver, so
  aliasing the handle does not slip past.
- Call sites must open their wrapper directly
  (`ctx.op((db) => db.table("feeds").get(id))`). A call nested deeper
  inside the arrow — a ternary branch, say — is isolated in fact but
  invisible to the structural check, so branches get split instead.
- Multi-step sequences that need atomicity must say so explicitly with
  a transaction, as `replaceTablesAtomically` does. They no longer get
  it by accident from an ambient zone, which is the point: accidental
  enrollment was the defect.
- `ownTransaction` is not a general escape hatch for Dexie's zone
  model. It is the entry-point discipline for one module. If a second
  module ever talks to Dexie, it adopts the same rule and the same
  structural guard, or it does not talk to Dexie.

## Alternatives considered

- **Drop the explicit transaction in `importAll`.** Removes the ambient
  zone entirely, and with it the atomic clear+replace that
  `tests/e2e/sync-100-feeds.spec.ts` exists to protect. Trading a data
  visibility guarantee for a scheduling one is the wrong direction.
- **Wrap only the read paths.** The reported symptom is a read, but a
  write bleeds identically, and a write that joins the import
  transaction before its `clear()` is undone with no error at all. A
  rule that covers the reported case only leaves the silent case.
- **Retry on `TransactionInactiveError`.** Masks the defect, keeps the
  silent write-loss variant, and makes the next occurrence harder to
  diagnose.
