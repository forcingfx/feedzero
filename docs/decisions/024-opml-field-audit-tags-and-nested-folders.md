# ADR 024 — OPML field audit: tags and nested folders

Status: accepted (2026-05-24)

## Context

A field-by-field audit of FeedZero's OPML 2.0 importer found we were
consuming 5 of 13 outline attributes and 0 of 13 head attributes (see
the audit plan in the PR description). Three of those drops were
spec violations or bugs that produced real harm:

- `outline.title` was extracted by `opml-service.ts` but dropped at the
  `import-view.tsx` → `addFeed()` boundary, so the user's chosen feed
  name was silently overridden by whatever the publisher's feed body
  reported. Reported in issue #117 (2026-05-23, CNBC outline imports as
  "International: Top News And Analysis").
- `outline.isComment="true"` was ignored. Many readers (NetNewsWire,
  ReadKit) use commented-out outlines to remember unsubscribed feeds;
  FeedZero silently re-subscribed them on every migration.
- `outline.type` was ignored. `type="link"` (blogroll references),
  `type="include"` (external OPML inclusion), and `type="directory"`
  (listings) are not feed subscriptions per OPML 2.0 — subscribing to
  them was wrong.

Beyond the bugs, several attributes that carry real user data were
being dropped on the floor: `created` (when the user originally
subscribed in their previous reader), `description` (publisher blurb
the source reader stored), `category` (comma-separated tag list per
spec), and any folder nesting deeper than one level. Head attributes
(`title`, `dateCreated`, `ownerName`) — useful for confirming "this
is the OPML I expected to import" — were not surfaced at all.

PR #188 addresses the full audit in three parts:

1. **Part 1 (the issue #117 fix + spec correctness):** thread
   `outline.title` through `addFeed({ titleOverride })`; honor
   `isComment` and the non-subscribable `type` values.
2. **Part 2 (this ADR):** harvest the rest of the meaningful field
   surface — `description`, `category`, `created`, full folder
   nesting, and head metadata.
3. **Part 3:** round-trip these on export so FeedZero is no longer a
   lossy format.

## Decision

### `Feed.tags`

Add `Feed.tags?: string[]` as an additive, optional field. Populated
on OPML import by splitting `outline[category]` on `,`, trimming, and
deduping. Queryable via a new `{ kind: "tag"; op: "in" | "not-in"; value: string[] }`
variant on the `Condition` discriminated union — wired through the
smart-filter editor as a "Tag" row with a free-form comma-separated
input. Sync vault: additive optional, no version bump.

We deliberately chose tags over "treat category like a folder
fallback" because OPML categories are explicitly multi-valued: a feed
can be tagged `tech, frontend, react`. Folders are single-valued.
Collapsing categories to "first one becomes the folder" lost the
multiplicity, and using all of them produced impossible folder
membership.

No top-level "browse by tag" sidebar surface in this push. Tags are
visible via the filter row and the feed-detail dialog; a richer
surface lands when a user asks. Tag CRUD (rename, merge, delete)
also deferred — the source of truth is the per-feed metadata and the
feed-edit dialog already covers it.

### `Folder.parentId`

Add `Folder.parentId?: string` as an additive, optional field.
`createFolder(name, parentId?)` and the new pure helpers in
`src/core/feeds/folder-tree.ts` (`isDescendantOf`, `childrenOf`,
`depthOf`, all defensively capped against malformed cycles) handle
the tree shape.

The sidebar renders recursively: top-level folders are rendered by
`SidebarFeedList`; nested folders render inside their parent's
collapsible via the same `FolderItem` component. DnD reorder
currently operates on the top-level slice; nested-folder reorder is
a follow-up.

`folderCustomOrder` (in `UserPreferences`) stays a flat array. The
order is applied within siblings (folders sharing a parentId render
in the order they appear in the flat array). This is tighter
semantics, not a schema change — older clients that built the array
under a flat-only assumption continue to work.

### `outline.created` → `Feed.createdAt`

`createFeed({ createdAt })` accepts an override; `addFeedFlow` threads
`options.createdAtOverride`. A non-positive value (NaN / 0 /
negative) silently falls back to `Date.now()` rather than persisting
a nonsensical stamp. Preserves "I've been subscribed to The Guardian
since 2014" through migrations.

### `outline.description` → `Feed.description` fallback

`addFeedFlow` accepts `options.descriptionFallback`. Used ONLY when
the parsed feed body's description is empty — the publisher's own
description is the authoritative source; the OPML's is for placeholder
feeds (dead publishers, OPML imports that haven't yet refreshed).

### OPML `<head>` → ImportResults header

`parseOpmlFile` now returns `{ entries, folders, head }`. The
`import-store` carries the head info; `ImportResults` renders a small
attribution line: "Imported from {ownerName} \"{title}\" ({dateCreated})".
None of these fields are persisted — provenance only, for the user to
confirm "yes that's the OPML I exported". `ownerEmail` / `ownerId` are
deliberately NOT read (PII).

## What we deliberately did NOT change

- `outline.language` / `outline.version` / `outline.url` / `outline.isBreakpoint` —
  no destination in our data model; the value of preserving them
  doesn't justify the field bloat. Revisit if/when we ship a
  reading-language UX.
- Head `expansionState` / `vertScrollState` / `window*` — outliner-GUI
  state, irrelevant to a reader.
- Head `ownerEmail` / `ownerId` / `docs` / `dateModified` — PII (the
  first two) or low-value provenance. Never read; never written.
- A folder rename / move-via-drag UX for nested folders — out of scope.
  Existing folder rename still works unchanged; nested folder moves
  go through `moveFolderToParent` (Result-typed; rejects cycles via
  `isDescendantOf`).
- The placeholder-feed first-refresh title-backfill path. Currently
  `refreshFeed`'s "first success backfill" overwrites
  `feed.title`/`description`/`siteUrl` unconditionally. If an OPML
  import sets these on a placeholder, the first refresh clobbers
  them. Fix is "only backfill when current value equals the URL-host
  derived default"; deferred to keep this PR's blast radius bounded.
  Filed as follow-up.

## Consequences

- **Sync vault**: every new field is optional. v1 clients reading a v2
  vault see `tags` and `parentId` as undefined and treat them as
  absent — graceful degrade. v2 clients reading a v1 vault see no
  tags / parentIds — same.
- **Filter evaluator**: every existing filter continues to work
  unchanged. The new `tag` condition is opt-in.
- **OPML round-trip lossiness**: Part 2 lands the import side.
  Part 3 (in the same branch) writes the corresponding fields back
  on export so FeedZero → OPML → FeedZero is lossless.

## References

- Issue #117 (last comment, 2026-05-23) — the title-drop bug that
  anchored the audit.
- The audit plan / PR description (PR #188 body) — full field-by-field
  before/after matrix.
- `src/core/opml/opml-service.ts` — the parser + generator.
- `src/core/feeds/folder-tree.ts` — pure tree helpers.
- `src/core/filters/evaluator.ts` — `tag` Condition handling.
