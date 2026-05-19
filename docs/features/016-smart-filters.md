# Feature 016: Smart filters

## Status
Implemented

## Summary

User-defined "smart playlists" for articles. A smart filter is a saved
rule that pulls articles from every loaded feed where the rule evaluates
true — title contains keywords, from a particular feed/folder, published
in the last N days, read/starred state, or any combination, with
nested `all`/`any` groups and a `NOT` inversion.

Filters live in the sidebar alongside "All items" and "Starred", and
sync across devices through the encrypted vault (Personal tier). The
evaluator is pure, deterministic, and runs entirely client-side — no
article content leaves the device, in keeping with the strategy's
privacy thesis (`docs/strategy/003-playing-to-win.md`).

The iTunes "smart playlist" parallel is intentional: rich condition
language, live re-evaluation, no manual maintenance.

## Behaviour

```gherkin
Feature: Smart filters

  Scenario: A Personal user creates a smart filter
    Given a Personal-tier user with two feeds
    When they open the "New filter" affordance in the sidebar
    And they enter a name "Recent AI"
    And they add a condition "title contains AI"
    And they add a condition "read is false"
    And they save
    Then the filter persists to the encrypted smartFilters table
    And the sidebar shows a new "Recent AI" entry
    And /feeds/filter:<id> shows only unread articles whose title
      contains "AI"

  Scenario: Filter conditions can be nested
    Given the user is editing a filter
    When they add a nested "match any" group containing
      "starred is true" and "title contains breaking"
    Then articles match when they satisfy the outer "all" group AND
      at least one of the inner conditions
    And the editor renders the nested group with a left border + indent

  Scenario: The evaluator is defensive against malformed input
    Given a filter has a condition "title matches '[unterminated'"
    When the article list re-renders
    Then the bad-regex condition resolves to false
    And the article list renders normally (no crash)

  Scenario: Filter references catch cycles
    Given filter A references filter B
    And filter B references filter A
    When the evaluator runs against an article
    Then the cycle resolves to false rather than recursing forever

  Scenario: Filters sync across devices
    Given a Personal user creates a filter on device 1
    When the debounced sync push fires
    And device 2 pulls the vault
    Then the filter appears in device 2's sidebar

  Scenario: Free user attempts to use filters
    Given a free user with the paid tier active
    When the sidebar renders
    Then the Filters section is hidden entirely
    And the free user cannot programmatically open the editor
      (store-level gate enforcement)

  Scenario: Editing the gate-locked feature surfaces the upgrade
    Given a free user (with paid tier active) calls openEditor()
      via a future shortcut
    When the store action runs
    Then a toast tells them filters are a Personal feature
    And the editor does not open
```

## Architecture

### Flow

1. User clicks "New filter" in the sidebar (or "Edit" on an existing
   row).
2. `useSmartFilterStore.openEditor(target?)` flips `editorOpen = true`
   and stores `editorTarget`. Gate-locked: free users get a toast
   instead.
3. `<SmartFilterEditorDialog>` (mounted at top level in `app.tsx`)
   subscribes to those flags and renders.
4. The dialog hydrates local state from the target and renders
   `<ConditionGroupEditor>` recursively.
5. Live `evaluateFilter` runs every render over the loaded article set
   to populate the "X articles match" preview counter.
6. On Save: `validateFilter` checks the rule shape; the store dispatches
   `createFilter` or `updateFilter`; storage encrypts and persists via
   the `smartFilters` Dexie table; the in-memory `filters[]` reloads;
   `scheduleSyncPush` queues the vault update.
7. Sidebar re-renders with the new filter. URL navigation to
   `/feeds/filter:<id>` triggers `loadArticles` → bulk read →
   `deriveVisibleArticles` runs the evaluator over every article and
   returns the matched + sorted + limited set.
8. Vault sync carries the filter to other devices; v1/v2 vaults are
   read-only on this dimension (back-compat rule in
   `docs/decisions/019-folder-sync-via-vault.md`).

### Files

| File | Role |
|------|------|
| `src/types/index.ts` | `SmartFilter`, `ConditionGroup`, `Condition` types |
| `src/utils/constants.ts` | `FILTER_FEED_PREFIX` + helpers; `DB_VERSION` bumped to 5 |
| `src/core/storage/schema.ts` | `createSmartFilter` factory |
| `src/core/storage/db.ts` | `smartFilters` Dexie table + CRUD; `exportAll` / `importAll` widened to handle folders + smartFilters with the back-compat rule |
| `src/core/sync/types.ts` | `VaultData` v2: optional `folders` + `smartFilters` |
| `src/core/sync/sync-service.ts` | `exportVault` / `importVault` forward the new fields; `mergeVaults` merges by id with local-wins |
| `src/core/filters/evaluator.ts` | **new** — pure `evaluateFilter` / `evaluateGroup` / `evaluateCondition`; `buildContext` |
| `src/core/filters/validation.ts` | **new** — pre-storage validation (non-empty values, valid regex, bounds) |
| `src/core/features/feature-gates.ts` | `filters` flipped from coming-soon → shipped (Personal tier) |
| `src/stores/smart-filter-store.ts` | **new** — CRUD store + editor open/close state |
| `src/stores/article-store.ts` | `deriveVisibleArticles` + `loadArticles` route filter ids through the evaluator |
| `src/components/layout/sidebar-body.tsx` | Filters section (gated on `useFeatureGate("filters")`) |
| `src/components/layout/header-breadcrumbs.tsx` | `resolveVirtualFeed` handles filter:&lt;id&gt; |
| `src/components/layout/mobile-nav-drawer.tsx` | Drawer handle label for filter virtual feeds |
| `src/components/sidebar/smart-filter-item.tsx` | **new** — sidebar row + edit/duplicate/delete menu |
| `src/components/smart-filters/smart-filter-editor-dialog.tsx` | **new** — editor dialog driven by the store |
| `src/components/smart-filters/condition-group-editor.tsx` | **new** — recursive group editor |
| `src/components/smart-filters/condition-row.tsx` | **new** — single condition row with contextual value widget |
| `src/app.tsx` | Mounts `<SmartFilterEditorDialog>` and calls `loadSmartFilters()` on db-ready |

### Tests

| File | Coverage |
|------|----------|
| `tests/utils/filter-feed-id.test.ts` | FILTER_FEED_PREFIX + helpers, isAggregatedFeedId extension, cross-kind non-collision |
| `tests/types/smart-filter.test.ts` | Type-shape enumeration of every condition kind × op |
| `tests/core/storage/smart-filter-schema.test.ts` | createSmartFilter factory + validation |
| `tests/core/storage/smart-filter-db.test.ts` | Encrypted CRUD + nested rule round-trip |
| `tests/core/sync/folders-filters-vault-roundtrip.test.ts` | exportAll/importAll/exportVault/importVault/mergeVaults across folders + smartFilters; undefined-vs-empty contract; v1 cloud back-compat |
| `tests/core/filters/evaluator.test.ts` | 32 cases — every operator + group composition + filterRef cycle + deterministic ctx.now |
| `tests/core/filters/validation.test.ts` | 13 cases — every rejection path |
| `tests/stores/smart-filter-store.test.ts` | CRUD + gate enforcement + duplicate |
| `tests/stores/article-store-filter-view.test.ts` | Filter virtual feed dispatch + sort/limit overrides + cross-feed selection |
| `tests/components/layout/sidebar-filters.test.tsx` | Section visibility per gate + row interactions |
| `tests/components/smart-filters/smart-filter-editor-dialog.test.tsx` | Dialog open/close, create vs edit, Save dispatch, Cancel discard, gate-locked path, live preview count |

## Design Decisions

- **Pure evaluator, no materialization.** A smart filter is a *function*
  over the article set, not a stored result. Re-evaluating on every
  render is cheap for realistic article counts (~thousands) and means
  there's no cache to invalidate when articles arrive or `starred`
  changes. The reader can compare two filters by looking at the rule —
  no "stale view" pathology.
- **Folder-sync shipped alongside.** Filters reference folder ids
  (`folder is X`). For that condition to make sense on a second device,
  folder ids must be stable across devices, so folder data is now
  carried by the vault. The migration is non-destructive (see ADR 019).
- **`undefined` vs `[]` back-compat.** `VaultData.folders === undefined`
  means "the source has no opinion"; `folders === []` means "the source
  has zero folders". The importer respects the distinction so a pre-v2
  client's push doesn't wipe a v2 client's data. Tests pin this in
  `folders-filters-vault-roundtrip.test.ts`.
- **Defensive evaluator.** Invalid regex, missing feeds/folders, and
  filterRef cycles all resolve to `false` rather than throwing. A vault
  sync from a future client with an unknown condition shape doesn't
  freeze the article list — the user sees an empty filter, fixes the
  rule in the editor.
- **Editor uses local state, not store state.** The in-flight edit is
  React useState, not a store slice. Cancel = discard local snapshot,
  no rollback ceremony. The store only learns about the change when
  Save dispatches.
- **Free users see no Filters section.** The "upgrade to unlock"
  pattern in the sidebar would clutter the empty state. Free users
  who pulled a vault with filters in it still have the data; the UI
  just doesn't expose it until they re-upgrade.
- **Open-source primitives in the editor.** Used the existing shadcn
  Dialog / Popover / Switch / Checkbox / DropdownMenu / Input. No new
  dependencies. The recursive `<ConditionGroupEditor>` handles
  arbitrarily deep nesting; the left-border indent makes structure
  visually obvious without extra UI chrome.

## Limitations

- **No icon picker** — every filter uses the default Filter icon in
  violet. The `icon` field exists on `SmartFilter` for a future picker.
- **No filter ordering UI.** Filters appear in `getSmartFilters()`
  insertion order. Drag-to-reorder is a v2 polish.
- **No filter import/export as JSON** separate from the vault.
- **No keyboard shortcut to open the editor** — by design for v1
  (avoiding key conflicts with existing j/k/o/h/n/s/[/r/Space). Add
  once we have a clear shortcut.
- **Live preview counter is not memoised across renders** — it runs the
  evaluator on every keystroke. Fine for thousands of articles; if
  profiling shows real pain, debounce in the editor.
- **No AI-assisted "describe a filter in English"** flow. That's the
  AI-Signal roadmap row (Pro tier, BYO key). The deterministic UI is
  the v1 surface.
