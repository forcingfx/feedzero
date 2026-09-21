import Dexie from "dexie";

/**
 * Issue one Dexie operation in a transaction of its own, never in an
 * ambient one.
 *
 * **Why every Dexie call in `db.ts` goes through this.** Dexie tracks
 * "the transaction I am currently inside" in a zone that follows
 * promise continuations. The zone is not private to the code that
 * opened the transaction: a promise belonging to unrelated work, if it
 * happens to resume while an explicit `db.transaction()` is running,
 * inherits it. The bystander's next Dexie call then silently joins a
 * transaction it never asked for.
 *
 * That is fatal here because every read decrypts and every write
 * encrypts. IndexedDB commits a transaction as soon as the event loop
 * turns with no request outstanding, and `await crypto.subtle…` is
 * exactly such a turn. So the bystander joins the transaction, the
 * transaction commits under it, and its next call lands on a finished
 * transaction:
 *
 *   Firefox:          UnknownError: Attempt to get records from
 *                     database without an in-progress transaction
 *   fake-indexeddb:   TransactionInactiveError
 *
 * The app has exactly one explicit transaction — the atomic table
 * replacement in `importAll` — which is why this surfaced as a sync
 * error: a pull's import runs while refresh reads and the debounced
 * push's export are in flight, and whichever of them resumes inside
 * the zone is the one that fails. Nothing is wrong with the import;
 * the casualty is always some other operation.
 *
 * `Dexie.ignoreTransaction` is a no-op when no transaction is ambient,
 * so the wrapper costs nothing on the normal path.
 *
 * Operations that MUST join a transaction (the bodies of a deliberate
 * `db.transaction()` callback) must NOT be wrapped — they belong to
 * that transaction by design.
 *
 * @param op Starts the Dexie operation. Called synchronously, inside
 *   the cleaned zone, so the operation is created there.
 */
export function ownTransaction<T>(op: () => PromiseLike<T>): Promise<T> {
  return Promise.resolve(Dexie.ignoreTransaction(op));
}
