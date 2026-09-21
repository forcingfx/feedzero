import { describe, it, expect, afterEach } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { ownTransaction } from "@/core/storage/dexie-zone";

/**
 * Reproduction of the failure `ownTransaction` exists to prevent.
 *
 * Dexie tracks "the transaction I am currently inside" in a zone that
 * follows promise continuations. A promise that happens to resume while
 * an explicit `db.transaction()` is running inherits that zone, even
 * when it belongs to completely unrelated work. Its next Dexie call
 * then joins a transaction it never asked for, and the moment that
 * transaction commits (which it does as soon as the owner awaits
 * something that is not a Dexie operation — Web Crypto, in this app)
 * every later call on it fails.
 *
 * In the browser that surfaces as Firefox's
 * `UnknownError: Attempt to get records from database without an
 * in-progress transaction`; under fake-indexeddb Dexie's own guard
 * catches it first and says `TransactionInactiveError`. Same defect,
 * different messenger.
 *
 * These tests own their Dexie instance rather than going through
 * `db.ts`, because the zone bleed has to be provoked from inside a
 * transaction on the same instance, and provoking it through the real
 * module would mean racing a timer.
 */

let db: Dexie | null = null;

afterEach(async () => {
  db?.close();
  db = null;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("zone-test");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

async function openTestDb(): Promise<Dexie> {
  const instance = new Dexie("zone-test");
  instance.version(1).stores({ covered: "id", uncovered: "id" });
  await instance.open();
  await instance.table("covered").bulkPut([{ id: "a" }, { id: "b" }]);
  await instance.table("uncovered").put({ id: "x" });
  db = instance;
  return instance;
}

/**
 * Run `work` in a continuation that resumes inside `transactionBody`'s
 * zone, exactly as an unrelated read does when it resumes while the
 * sync import transaction is running.
 */
async function duringTransaction<T>(
  instance: Dexie,
  work: () => Promise<T>,
): Promise<T> {
  let release!: () => void;
  const resumedInsideTheZone = new Promise<void>((resolve) => {
    release = resolve;
  });

  const bystander = resumedInsideTheZone.then(work);

  await instance.transaction("rw", [instance.table("covered")], async () => {
    await instance.table("covered").clear();
    release();
    await instance.table("covered").bulkPut([{ id: "a" }]);
  });

  return bystander;
}

/** A pause that is not a Dexie operation, like the app's encrypt/decrypt. */
const nonDexieAwait = () => new Promise((r) => setTimeout(r, 15));

describe("ownTransaction", () => {
  it("keeps a read working when it resumes inside another transaction's zone", async () => {
    const instance = await openTestDb();

    const rows = await duringTransaction(instance, async () => {
      const first = await ownTransaction(() =>
        instance.table("covered").toArray(),
      );
      await nonDexieAwait();
      const second = await ownTransaction(() =>
        instance.table("covered").toArray(),
      );
      return [first, second];
    });

    expect(rows.map((r) => r.length)).toEqual([1, 1]);
  });

  it("reaches a table the ambient transaction never covered", async () => {
    const instance = await openTestDb();

    const rows = await duringTransaction(instance, () =>
      ownTransaction(() => instance.table("uncovered").toArray()),
    );

    expect(rows).toHaveLength(1);
  });

  it("is the difference between working and failing (the bug it prevents)", async () => {
    const instance = await openTestDb();

    const outcome = await duringTransaction(instance, async () => {
      try {
        await instance.table("covered").toArray();
        await nonDexieAwait();
        await instance.table("covered").toArray();
        return "no error";
      } catch (e) {
        return (e as Error).name;
      }
    });

    // Without the wrapper the bystander read joins, then outlives, the
    // transaction. If this ever stops failing, Dexie changed its zone
    // semantics and the wrapper deserves a fresh look.
    expect(outcome).toBe("TransactionInactiveError");
  });

  it("passes the operation's value straight through when nothing is ambient", async () => {
    const instance = await openTestDb();
    await expect(
      ownTransaction(() => instance.table("covered").count()),
    ).resolves.toBe(2);
  });
});
