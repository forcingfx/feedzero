# ADR 026: Sync push as a derived subscription

## Status

Proposed, 2026-05-28. Not yet implemented — see "Why proposed only" below.

## Context

The sync-push policy was extracted into
[`src/stores/sync-coordinator.ts`](../../src/stores/sync-coordinator.ts)
in the commit that introduced this ADR. That extraction is honest
polish: the debounce + jitter + pending-push-marker logic now lives in
one place instead of being interleaved with sync-store's state-machine
concerns.

But the *structural* bug class around sync push wasn't fixed by the
extraction. It's this: **38 call sites across feed-store,
article-store, briefing-store, and smart-filter-store explicitly call
`scheduleSyncPush()` after mutating syncable data.** Any mutator that
*forgets* to call it produces a silent "the change is local-only,
will be overwritten on the next pull" bug.

The forget-to-call class is exactly what produced the four recent
incidents named in [ADR 025](./025-test-the-user-not-the-function.md).
We have no structural defense against it today — only the discipline
of every mutator author remembering. Empirically, that discipline
holds most of the time but breaks badly when it doesn't.

## Decision (proposed)

Replace the 38 explicit `scheduleSyncPush()` calls with a
**subscription-derived** push: the sync coordinator observes each
syncable store's "syncable snapshot" and schedules a push when the
snapshot changes. Mutators no longer participate.

### Shape

```ts
// In each syncable store (feed, article, smart-filter, briefing,
// preferences):
export function feedStoreSyncableSnapshot(s: FeedStore) {
  // Return ONLY the fields that end up in the vault.
  // Carefully enumerated. UI-only fields (selectedFeedId,
  // isRefreshingAll, isLoading, recentFeedIds) are excluded.
  return {
    feeds: s.feeds,
    folders: s.folders,
    feedSortMode: s.feedSortMode,
    feedCustomOrder: s.feedCustomOrder,
    folderCustomOrder: s.folderCustomOrder,
    folderOpenState: s.folderOpenState,
  };
}

// In sync-coordinator (or a new sync-observer module):
import { shallow } from "zustand/shallow";

export function observeSyncableStores(push: () => void): () => void {
  const unsubs = [
    useFeedStore.subscribe(feedStoreSyncableSnapshot, () => notifyChange(push), { equalityFn: shallow }),
    useArticleStore.subscribe(articleStoreSyncableSnapshot, () => notifyChange(push), { equalityFn: shallow }),
    // ... etc.
  ];
  return () => unsubs.forEach((u) => u());
}

// In AppInit (or wherever the coordinator boots):
useEffect(() => observeSyncableStores(() => useSyncStore.getState().push()), []);
```

Every mutator's `scheduleSyncPush()` call disappears. The coordinator
detects the change from the data itself.

### Why this works

- The contract is "if the syncable snapshot changes, push" — the
  policy is in one place and impossible to bypass from a mutator.
- Zustand's `subscribeWithSelector` middleware (or v5's built-in
  selector subscribe) with `shallow` equality only fires when one of
  the named fields changes — UI noise doesn't trigger.
- The cost of `shallow` on the snapshot is one comparison per
  mutation, negligible at our scale.

## Why proposed only

The migration is non-trivial and has a *data-loss* failure mode:
if the syncable snapshot is missing a field that mutators write to,
that field stops syncing **silently**. The user keeps mutating it on
device A, the cloud never sees the change, device B never gets it.
There is no error path for "forgot to include a field in the
snapshot" — it's a silent regression that only surfaces when a user
notices their data is out of sync (often weeks later).

To do this safely we need, per store:

1. **An exhaustive enumeration of vault-serialized fields** —
   cross-checked against `exportVault()`'s payload, against
   `importVault()`'s reads, and against every mutator that calls
   `scheduleSyncPush()` today.
2. **A "field-coverage" test** that runs the migration on each store
   and asserts every mutator that previously called `scheduleSyncPush`
   still triggers the coordinator under the new subscription path.
3. **A staging period** where both paths run (explicit calls AND
   subscription) and we log when they disagree. After a week with no
   disagreements, the explicit calls drop.

That's a real refactor, not a polish commit, and it deserves its own
RGR cycle with the field-coverage tests landed *before* the explicit
calls are removed.

## Consequences

### When implemented

- 38 lines of `schedulePush()` calls deleted across feed, article,
  briefing, smart-filter, preferences stores. Net negative LOC.
- The forget-to-call regression class becomes structurally
  unreachable. Adding a new syncable field is a one-line edit to the
  store's snapshot; missing it produces a test failure, not a silent
  bug.
- Mutator code becomes smaller and reads more honestly — it expresses
  "what changed", not "what changed *and* please remember to sync".

### Migration tax (one-time)

- Per-store `syncableSnapshot` selector + tests (5 stores, ~30 min each)
- Coverage test asserting every existing schedulePush call site is
  reachable via at least one subscription
- Two-week staging window with both paths instrumented

### Anti-goals

- This ADR does NOT propose subscribing to every store change with
  deep equality. That would catch noise (selectedFeedId, isLoading)
  and produce spurious pushes. The snapshot-based selector is the
  whole point.
- This ADR does NOT propose moving push policy into the DB layer
  (db.ts). The DB doesn't know about the vault's preference for
  "preferences" being last-write-wins vs "feeds" being merge — that
  policy is per-store.

## References

- ADR 025 — Test the user, not the function (the four-incident pattern
  this ADR's structural fix would prevent the next instance of)
- `src/stores/sync-coordinator.ts` — the extracted policy module this
  ADR builds on
- `src/core/sync/types.ts` `VaultData` — the authoritative list of
  syncable fields
- The 38 call sites are reachable today via:
  `grep -rn "schedulePush\b\|scheduleSyncPush" src/stores/`
