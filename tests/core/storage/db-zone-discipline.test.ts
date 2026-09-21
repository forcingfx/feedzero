import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Structural guard for the rule that `ownTransaction` encodes: no Dexie
 * operation in `db.ts` may inherit an ambient transaction zone.
 *
 * A behavioural test cannot hold this rule. The bleed only bites when
 * an unrelated promise resumes inside a running transaction, which in
 * the app is a matter of timing, not of call order — so a new
 * `getWidgets()` written without the wrapper would pass every test in
 * this suite and fail in Firefox for whichever user happened to be
 * syncing at the wrong moment. The rule has to be checked where it is
 * written down. See `src/core/storage/dexie-zone.ts` for why, and
 * `tests/core/storage/dexie-zone.test.ts` for the reproduction.
 *
 * The one deliberate exception is `replaceTablesAtomically`: its calls
 * belong to the transaction it opens, and wrapping them would defeat
 * the atomicity that the sync import depends on.
 */

const DB_SOURCE = resolve(__dirname, "../../../src/core/storage/db.ts");

const TRANSACTION_OWNER = "replaceTablesAtomically";

/** Strip comments so prose about `db.transaction()` isn't read as code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Cut out the body of the one function allowed to talk to Dexie
 * directly, by brace-matching from its declaration.
 */
function withoutTransactionOwner(source: string): string {
  const start = source.indexOf(`function ${TRANSACTION_OWNER}`);
  if (start === -1) {
    throw new Error(
      `db.ts no longer declares ${TRANSACTION_OWNER}. If the atomic ` +
        `import moved, move this test's exception with it.`,
    );
  }
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      return source.slice(0, start) + source.slice(i + 1);
    }
  }
  throw new Error(`Could not find the end of ${TRANSACTION_OWNER}`);
}

/**
 * Dexie calls that issue a request against a transaction. Matched on
 * any receiver, not just one named `db`, so aliasing the handle
 * (`const t = ctx.db; t.table(...)`) cannot slip past.
 */
const DEXIE_OPERATION = /([A-Za-z_$][\w$]*)\.(?:table|transaction|open)\(/g;
const WRAPPERS = ["ctx.op((db)=>", "ctx.op(async(db)=>", "ownTransaction(()=>"];

describe("db.ts transaction-zone discipline", () => {
  it("issues every Dexie operation through ownTransaction", () => {
    const code = withoutTransactionOwner(
      stripComments(readFileSync(DB_SOURCE, "utf8")),
    ).replace(/\s+/g, "");

    const unwrapped: string[] = [];
    for (const match of code.matchAll(DEXIE_OPERATION)) {
      const before = code.slice(0, match.index);
      const opens = WRAPPERS.some((wrapper) => before.endsWith(wrapper));
      if (!opens) unwrapped.push(code.slice(match.index, match.index + 60));
    }

    // Each Dexie call must open its wrapper directly:
    //   ctx.op((db) => db.table("feeds").get(id))
    // A call nested deeper inside the arrow (a ternary branch, say) is
    // isolated too, but this check cannot see that, so keep the plain
    // form and split the branches instead.
    expect(unwrapped).toEqual([]);
  });

  it("still routes the atomic import through a real transaction", () => {
    const code = readFileSync(DB_SOURCE, "utf8");
    expect(code).toMatch(/db\.transaction\(\s*"rw"/);
  });
});
