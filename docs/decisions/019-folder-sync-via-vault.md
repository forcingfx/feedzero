# ADR 019: Folder + smart-filter sync via the encrypted vault, with `undefined` vs `[]` back-compat

## Status
Accepted (2026-05-19)

## Context

`VaultData` carried `feeds` + `articles` only through v1. Folders were
encrypted-at-rest in Dexie but local-only: a folder created on device A
never reached device B. This was tolerable while folders were a
secondary affordance, but smart filters (feature 016) introduced
`folder is X` conditions whose semantics break when folder ids aren't
stable across devices.

Three problems to solve at once:

1. **Folders need to ride to other devices.**
2. **Smart filters need to ride to other devices.**
3. **A v1 client (no concept of folders/filters in the vault) must not
   wipe a v2 client's data when it pushes.** This is the silent-loss
   bug class — the same shape that motivated ADR 018 (no-auto-destroy)
   and informed the issue #117 post-mortem.

## Decision

`VaultData` v2 adds **optional** `folders` and `smartFilters` arrays:

```ts
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
  folders?: Folder[];
  smartFilters?: SmartFilter[];
}
```

`importAll` interprets the optionality precisely:

- **`undefined`** → "the source vault has no opinion on this table".
  Leave local rows alone. Used by v1 clients that don't know the field
  exists.
- **`[]`** → "the source has zero rows". Clear the table.
- **`[...items]`** → "the source has these rows". Atomically clear +
  bulkPut.

`mergeVaults` (the local-vs-cloud reconciler used during the
local-only → sync transition) follows the same rule via a generic
`mergeByIdLocalWins` helper. Local entries win on id collisions; cloud-
only entries are appended; if both sides have no opinion the result is
`undefined` (preserves the local set untouched).

`exportAll` always populates both arrays from the local Dexie tables,
so v2 clients always push the full shape. v1 clients won't include
the keys; their push leaves the v2 client's folders + filters in place.

## Consequences

### Positive

- Folders + smart filters work as expected on every device after sync.
- A user with an old client co-existing with a new client cannot lose
  data by accident. The first push from the new client carries the
  full shape forward.
- The optionality boundary keeps the diff to `VaultData` small and
  back-compatible; no version-handshake protocol on the wire.
- The same generic merge helper covers both new collections; future
  collection additions reuse the same pattern.

### Negative

- v1 clients can never *remove* folders or smartFilters from a v2
  client's local state — they have no way to express "I deliberately
  want this to be empty". This is the right trade-off: silent loss is
  the worse failure, and v1 clients are by definition transitional.
- The undefined-vs-empty distinction is a contract that's easy to miss
  in future call sites. The single rw-transaction in `importAll` is
  the canonical enforcement point; tests in
  `folders-filters-vault-roundtrip.test.ts` pin the rule.

### Neutral

- `SYNC.FORMAT_VERSION` bumped 1 → 2. The runtime field is
  informational; consumers must not switch on it — they must tolerate
  either shape.

## Alternatives considered

- **Required `folders: Folder[]`, with v1 clients writing `[]`.**
  Rejected: a v1 client can't be made to do that retroactively. Any
  v1 → v2 push during a transition window would wipe v2 folders.
- **A separate folder-vault endpoint.** Doubles the server surface and
  the encryption pipeline; doesn't justify the cost.
- **Per-field version handshake on push.** Adds a round-trip and a new
  failure mode for negligible benefit. Optional fields are the
  Postel's-law-compliant answer.

## References

- Feature: `docs/features/016-smart-filters.md`
- ADR 018 (no-auto-destroy) — same data-loss bug class
- `src/core/storage/db.ts:importAll` — canonical enforcement
- `src/core/sync/sync-service.ts:mergeVaults` + `mergeByIdLocalWins`
- `tests/core/sync/folders-filters-vault-roundtrip.test.ts` — pinned tests
