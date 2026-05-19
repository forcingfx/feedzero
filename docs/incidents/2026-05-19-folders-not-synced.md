# Bug: folders are not part of the sync vault

## Metadata

- **Date:** 2026-05-19 (surfaced during issue #117 follow-up)
- **Detected at:** 2026-05-19 11:30 UTC (issue #117 comment from
  self-hoster DoubtfulYeti592 on a fresh 2nd-device VM)
- **Status:** Documented, fix pending in a separate PR
- **Severity:** SEV3 — user-visible feature gap, no data loss. Local
  organization on Device 1 silently fails to propagate to Device 2.
- **Author:** Claude (investigate-issue-117 session)

## Summary

Multi-device sync carries `feeds` and `articles` but not `folders`.
On a second device, any feed whose `folderId` points at a folder that
was created on the first device renders **nowhere** in the sidebar —
not under "unfiled" and not inside any folder, because the folder
record doesn't exist locally. The "All items" tab still shows every
article, which masks the bug as "articles propagate, feeds don't."

The user's report (verbatim):

> "the feed sources don't propagate in the far left panel on the 2nd
> device (a separate virtual machine). That said, the articles do
> propagate under the 'All items' tab in that panel."

That wording is the diagnostic fingerprint of this bug.

## Symptoms

On a freshly-provisioned second device after restoring from a sync
vault whose feeds have been organized into folders on Device 1:

- "All items" is visible in the sidebar (feeds.length > 0).
- "All items" lists every article correctly.
- Individual feed entries are missing from the sidebar entirely.
- The Settings → Data → Export field shows the feeds (they ARE in
  IndexedDB).

Local-only users and sync users who never organize feeds into
folders are unaffected (feeds default to `folderId: undefined` →
they render in the "unfiled" bucket).

## Reproduction

1. Device 1: onboard with sync. Add several feeds. Create a folder
   (or import an OPML file that preserves folder structure, or run
   auto-organize). Move at least one feed into the folder.
2. Wait for the sync push to complete.
3. Device 2: fresh install, restore via the same passphrase.
4. Open the app. The sidebar shows "Explore", "All items", and
   nothing else under it — the feeds you organized are invisible.
5. Confirm the feeds are in IndexedDB by opening Settings → Data →
   Export. The feeds appear in the JSON.

## Root cause

`VaultData` (`src/core/sync/types.ts:5-10`) defines the sync payload
as feeds + articles only:

```ts
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
}
```

- `exportVault` (`src/core/sync/sync-service.ts:82`) calls
  `exportAll()` which returns `{ feeds, articles }` —
  `src/core/storage/db.ts:431-445`. Folders are never read.
- `importVault` (`src/core/sync/sync-service.ts:100`) calls
  `importAll(feeds, articles)` which clears + bulkPuts those two
  tables inside a Dexie rw transaction —
  `src/core/storage/db.ts:460-487`. The `folders` table is never
  touched on the receiving device.
- `Feed.folderId` (`src/types/index.ts:8`) IS serialized into the
  vault because it's a field on the `Feed` interface. So the
  receiving device gets feeds with dangling `folderId` references
  pointing at folder UUIDs that exist only on Device 1.

## Why the symptom is "invisible feeds" specifically

`SidebarFeedList` (`src/components/sidebar/sidebar-feed-list.tsx`)
partitions feeds into two disjoint buckets:

- Line 76: `unfiledFeeds = feeds.filter(f => !f.folderId)` —
  feeds **with** `folderId` are excluded from the unfiled bucket.
- Lines 77-86: `feedsByFolder = Map<folderId, Feed[]>` — feeds
  **with** `folderId` are placed into buckets keyed by their
  parent folder.
- Line 222: `sortedFolders.map(...)` only iterates folders that
  exist in `useFeedStore(s => s.folders)`. On Device 2 that array
  is `[]` (folders aren't synced), so no folder buckets render.

Net effect: a feed with `folderId = "abc"` is excluded from
`unfiledFeeds` AND its enclosing folder never renders. The feed is
invisible.

"All items" survives because:

- `SidebarBody` (`src/components/layout/sidebar-body.tsx:50`) gates
  the entry on `feeds.length > 0` only — no folder dependency.
- Article fetching for `ALL_FEEDS_ID`
  (`src/stores/article-store.ts:129`) flat-maps every entry of
  `articlesByFeedId` regardless of feed-store folder structure.

## How feeds end up with `folderId` set

Three production paths:

1. **Manual organization.** `moveFeedToFolder` in `feed-store.ts:318`
   writes `folderId` onto the feed.
2. **OPML import that preserves folder structure.**
   `src/components/settings/import-view.tsx:143-174` creates a
   folder per unique `folderName` and assigns the matching feeds.
3. **Auto-organize.** `feed-store.ts:388-412` (the
   `applyAutoOrganize` plan) creates folders and writes `folderId`
   onto each member feed.

All three persist via `dbUpdateFeed` → encrypted IndexedDB →
included in `exportAll()` → packed into `VaultData.feeds[]`.

## Suggested fix (pending a separate PR)

One-shot scope:

1. Extend `VaultData` with `folders: Folder[]`.
2. `exportVault` includes `await getFolders()` in the payload.
3. `importAll` clears + bulkPuts the `folders` table inside the
   same Dexie rw transaction as feeds + articles, so the three
   stay consistent.
4. Bump `SYNC.FORMAT_VERSION`. Treat `vault.folders === undefined`
   as a back-compat case (older vaults exported before this fix):
   skip the folder import, leave the local `folders` table alone.
5. Update `mergeVaults` (`sync-service.ts:250`) to dedup folders by
   `id` (or by `name`, decide which is the natural identity — `id`
   if it survived a prior sync round-trip, `name` if cross-device
   creation produced distinct UUIDs for the same logical folder).
6. Smoke test: organize feeds into a folder on Device 1, restore
   on a fresh Device 2, confirm the folder and its feeds render.

### Out of scope (decide deliberately, don't drift)

`feed-store` keeps several local-only fields in localStorage:
`feedCustomOrder`, `folderCustomOrder`, `folderOpenState`,
`feedSortMode`. These are per-device UI preferences and are
arguably correct to keep local. The fix for this incident is
folder *structure*; sort/order preferences are a separate decision.

## Related

- Issue [#117](https://github.com/forcingfx/feedzero/issues/117) —
  the parent investigation. PR #121 closed the data-loss cascade;
  this bug surfaced in the user's follow-up confirmation comment.
- Incident
  [2026-05-19-sync-cascade.md](./2026-05-19-sync-cascade.md) —
  parent incident.
- `VaultData` interface — `src/core/sync/types.ts:5`.
- Sidebar partitioning logic —
  `src/components/sidebar/sidebar-feed-list.tsx:76-86,222`.
