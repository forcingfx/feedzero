# Feature 019: Floating settings cog (replaces sidebar dropdowns)

## Status
Implemented

## Summary

Every per-row three-dot dropdown in the sidebar — for feeds, folders,
and smart filters — has been replaced by a single **context-aware
floating cog** at the top-right of the article list, paired with the
existing **sort selector** (now rebuilt as an expanding-pill).

The cog opens the right settings dialog based on the currently
selected view:

| Selected view | Cog opens |
|---|---|
| Single feed (`f-tech`) | `FeedSettingsDialog` |
| Folder view (`folder:folder-tech`) | `FolderSettingsDialog` |
| Smart filter view (`filter:filter-recent`) | existing `SmartFilterEditorDialog` against that filter |
| `ALL_FEEDS_ID`, `STARRED_FEED_ID`, no selection | Cog is hidden |

The two pills (sort + cog) share the same `ExpandingPill` primitive:
icon-only circle by default, hover (desktop) or always-on (mobile)
expands a label rightward via a CSS `max-width` animation. The
sidebar rows are now select-only — no rename input, no dropdown, no
swap-on-hover badge logic.

## Behaviour

```gherkin
Feature: Floating cog over the article list

  Scenario: Open per-feed settings
    Given I have selected a single feed
    When I hover the cog at the top of the article list
    Then the cog expands to "Feed settings"
    When I click the cog
    Then the FeedSettingsDialog opens against that feed
    And it contains Name, Display (Prefer + Prefetch), Folder, Rules, Refresh, Clear cached, Delete

  Scenario: Open folder settings
    Given I have selected a folder view
    When I click the cog
    Then the FolderSettingsDialog opens against that folder
    And it contains Name, Color picker, Delete

  Scenario: Open smart-filter editor from the cog
    Given I have selected a smart-filter view
    When I click the cog
    Then SmartFilterEditorDialog opens against that filter

  Scenario: Cog hides where no settings apply
    Given I am on All articles / Starred / no feed selected
    Then the cog does not render

  Scenario: Cog hides on a broken reference
    Given the URL points to a folder or smart filter that no longer exists
    Then the cog does not render (defensive)

  Scenario: Mobile pill behaviour
    Given I am on a mobile-sized viewport
    Then the cog and sort pills always show their labels (no hover)
    And tapping either pill opens its menu / dialog directly
```

## Architecture

### Flow

1. User selects something in the sidebar — a feed, folder, or smart filter. Feed-store updates `selectedFeedId`.
2. `<ArticleListControls>` (sticky at the top of the article list) renders two children: `<SettingsPill>` and `<SortPill>`.
3. `SettingsPill` reads `selectedFeedId` + the various stores. The `resolveTarget` helper classifies the selection into `feed | folder | filter | null` and returns the matching label + dispatcher.
4. On click, the pill calls `openFeedSettings(id)` / `openFolderSettings(id)` / `openEditor(filter)` — each populates a slice on its store and mounts the corresponding dialog.
5. Dialogs are mounted at the app root (`src/app.tsx`), controlled entirely by store state — same pattern as `RulesEditorDialog`.

### Files

| File | Role |
|------|------|
| `src/components/ui/expanding-pill.tsx` | Reusable circle-to-pill primitive. Animates label `max-width` via CSS only. |
| `src/components/articles/article-list-controls.tsx` | Sticky-top flex container hosting `SettingsPill` + `SortPill`. Replaces the old `SortMenu` mount site. |
| `src/components/articles/sort-pill.tsx` | Article-sort selector rebuilt on `ExpandingPill`. Same modes + handler as before; new visual. |
| `src/components/articles/settings-pill.tsx` | Context-aware cog. Hides on aggregated views and broken refs; dispatches to the right dialog action. |
| `src/components/feeds/feed-settings-dialog.tsx` | Per-feed dialog (Name, Display, Folder, Rules, Actions). |
| `src/components/folders/folder-settings-dialog.tsx` | Per-folder dialog (Name, Color, Delete). |
| `src/components/folders/folder-color-picker.tsx` | Extracted color picker, shared with the (now-removed) sidebar dropdown's visual treatment. |
| `src/components/smart-filters/smart-filter-editor-dialog.tsx` | Existing dialog, now also hosts Duplicate + Delete in its footer. |
| `src/components/sidebar/feed-item.tsx`, `folder-item.tsx`, `smart-filter-item.tsx` | Each lost its DropdownMenu and is now select-only. |
| `src/stores/feed-store.ts` | New state: `feedSettingsDialogId`, `folderSettingsDialogId`, with paired open/close mutators. Mirrors `rulesEditorFeedId`. |
| `src/app.tsx` | Mounts `<FeedSettingsDialog />` + `<FolderSettingsDialog />` alongside the existing root dialogs. |

### Tests

| File | Coverage |
|------|----------|
| `tests/components/ui/expanding-pill.test.tsx` | Primitive renders as button, label in DOM, click + Enter activation, collapsed/expanded class wiring, mobile alwaysExpanded mode, disabled state. |
| `tests/components/articles/sort-pill.test.tsx` | Shows current mode label, opens menu with every mode, calls onChange. |
| `tests/components/articles/settings-pill.test.tsx` | Visibility matrix (ALL/STARRED/no-selection/deleted-folder/deleted-filter all return null) and dispatch matrix (feed/folder/filter each call the right store action, label adapts per context). |
| `tests/stores/feed-store-settings-dialogs.test.ts` | Open/close store actions for both new dialogs, including swap-target-without-close and independence between dialogs. |
| `tests/components/feeds/feed-settings-dialog.test.tsx` | Every section's write path — rename, prefer toggle, prefetch toggle, folder picker, unfiled, manage rules, refresh, clear, delete with confirm + cancel. |
| `tests/components/folders/folder-settings-dialog.test.tsx` | Rename, color swatch, click-to-clear, delete confirm + cancel, swatch count. |
| `tests/components/sidebar/feed-item.test.tsx`, `folder-item.test.tsx` | Rewritten as select-only — every dropdown assertion replaced by "no dropdown exists; settings live in the cog dialog". |

## Design Decisions

- **One cog, multiple dialogs — not one mega-dialog.** Each view's settings have different shapes (feed has six concerns; folder has three; smart filter has predicate + actions). A single dialog with tabs would force every view through the same shell; per-target dialogs keep each focused. The cog is the single entry; the dialogs are the per-type detail.
- **Hide the cog rather than disable it.** On `ALL_FEEDS` / `STARRED` / no-selection, the cog renders `null` instead of `disabled`. A disabled affordance teases functionality that isn't there.
- **Settings live where attention is.** Per-feed config was previously hidden behind a hover-only dropdown on a sidebar row. Surfacing the cog above the content the user is actively reading puts the affordance where they look — and removes the "discoverability via hover" problem.
- **Rename via dialog field, not inline edit.** The inline-input pattern was specific to the sidebar dropdown. Moving rename into the settings dialog costs one click but makes "rename" reachable from a fixed location instead of buried inside a dropdown the user has to discover.
- **Smart-filter editor absorbs Duplicate + Delete.** To keep the "no three-dot menus" invariant, the smart-filter editor now hosts these actions in its footer. Reviewers see one canonical surface for editing a filter — predicates, sort/limit, *and* lifecycle.
- **`ExpandingPill` is presentational.** No store reads, no routing, no dialog dispatch — those live in the wrappers (`SortPill`, `SettingsPill`). Future floating pills (per-view bookmarks, mark-all-read, anything) can reuse the same primitive without inheriting any of its consumers' logic.
- **Folder color picker extracted into `FolderColorPicker`.** Used by the dialog now; if a future surface (e.g. a settings export) needs to render the same swatch grid, it has the same component to import. The original sidebar treatment is the only consumer being deleted in this PR.

## Limitations

- **No bulk actions yet.** Each dialog operates on one target. Multi-select on the sidebar + a bulk operations menu would compose with the cog architecture (the cog could become "Bulk settings…" when multiple things are selected), but that's a separate feature.
- **No keyboard shortcut for the cog.** The pill is reachable via tab order; a dedicated shortcut (e.g. `,` for settings, mirroring many editors) is a small, additive change that didn't fit this PR's scope.
- **The smart-filter editor footer is denser than the others.** Duplicate + Delete on the left, Cancel + Save on the right. If the dialog grows another action later, we'll probably move destructive actions into a "danger zone" section like FolderSettingsDialog already has.
