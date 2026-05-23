# Feature 022: Command Palette

## Status
Implemented (palette only). Full-text search across the encrypted
article corpus is a follow-up (see [Limitations](#limitations)).

## Summary

A global keyboard-first overlay (⌘K / Ctrl+K) that surfaces every
action, every feed, and every loaded article behind a single fuzzy
search box. Modelled on the canonical Linear / Notion / VS Code
pattern; matches the productivity-app convention users already know.

The wider strategic frame is in [`docs/strategy/003-playing-to-win.md`](../strategy/003-playing-to-win.md):
of the five high-impact features identified to displace
Inoreader/Feedly/NewsBlur, the palette is the smallest unit that
delivers an immediate quality-of-life win, and it sets up the
infrastructure for the encrypted full-text search engine that comes
next.

## Behaviour

```gherkin
Feature: Command palette

  Scenario: Open with the keyboard
    Given the app is rendered
    When the user presses ⌘K (Mac) or Ctrl+K (everywhere else)
    Then the command palette opens centered on the screen
    And focus is in the search input

  Scenario: Summon while typing in another input
    Given the user is typing in the explore search box
    When they press ⌘K
    Then the palette opens regardless of the prior focus

  Scenario: Run an action
    Given the palette is open
    When the user selects "Mark all as read"
    Then article-store.markAllAsRead is invoked
    And the palette closes

  Scenario: Navigate to a feed
    Given the palette is open and the user has a feed named "Daring Fireball"
    When the user types "daring" and presses Enter
    Then the app navigates to /feeds/:id for that feed

  Scenario: Navigate to an article
    Given the palette is open and the article list is loaded
    When the user types a fragment of an article title
    Then matching articles surface under the "Articles" group
    And selecting one navigates to /feeds/:feedId/articles/:articleId

  Scenario: Close
    Given the palette is open
    When the user presses Escape, clicks outside, or selects any item
    Then the palette closes

  Scenario: Discover the shortcut by sight
    Given the user has never opened the palette
    When they hover the search icon in the sidebar header
    Then a tooltip surfaces "Command palette ⌘K"
```

## Architecture

### Flow

1. User presses ⌘K / Ctrl+K (or clicks the search icon in the sidebar
   header).
2. `use-keyboard-nav` calls `useCommandPaletteStore.getState().toggle()`.
   The shortcut check runs **before** the input-focus early return so
   the palette is summonable from anywhere.
3. `<CommandPalette>` (mounted at `<App>`) subscribes to `isOpen` and
   renders the dialog. It is mounted at the root, not inside any
   route, so opening it can't be lost during a navigation.
4. The palette renders three sections (in this order):
   - **Actions** — `buildCommandActions({ navigate, theme })` returns
     a flat list grouped by `Navigate / Feeds / Read / Appearance /
     Account`. Each action carries a label, optional icon, optional
     keyboard-shortcut hint (for display only), `keywords` (extra
     terms cmdk's fuzzy matcher uses), and a `run` callback.
   - **Feeds** — every feed in `useFeedStore`, fuzzy-matched by title
     and URL. Enter navigates to `/feeds/:id`.
   - **Articles** — the first 50 entries from `useArticleStore.articles`
     (the currently-loaded list). Fuzzy-matched by title. Capped
     because cmdk renders all items in the DOM.
5. Selecting any item runs its `onSelect` callback, which closes the
   palette and invokes the side effect.

### Files

| File | Role |
|------|------|
| `src/components/ui/command.tsx` | shadcn-style wrapper over the `cmdk` library (Command, CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator, CommandShortcut, CommandEmpty) |
| `src/components/command-palette/actions.ts` | Pure factory `buildCommandActions({ navigate, theme })` returning the action descriptors |
| `src/components/command-palette/command-palette.tsx` | The dialog component, mounted at `<App>` |
| `src/stores/command-palette-store.ts` | `{ isOpen, open, close, toggle }` zustand store |
| `src/hooks/use-keyboard-nav.ts` | Wires the ⌘K / Ctrl+K shortcut |
| `src/components/layout/app-sidebar.tsx` | Search button in the sidebar header + tooltip with the shortcut |
| `src/components/layout/keyboard-shortcuts-dialog.tsx` | Lists ⌘K in the Actions group |
| `src/components/settings/tabs/help-tab.tsx` | Same listing in the in-app help |

### Tests

| File | Coverage |
|------|----------|
| `tests/stores/command-palette-store.test.ts` | Store API (open/close/toggle) |
| `tests/hooks/use-keyboard-nav.test.tsx` | ⌘K + Ctrl+K toggle the palette; works from inside an input; plain `k` is not the shortcut |
| `tests/components/command-palette/actions.test.ts` | Every action's `run` produces the right side effect; groups are valid; ids unique; all icons present |
| `tests/components/command-palette/command-palette.test.tsx` | Open/close, sections render, action click navigates + closes, feed click navigates, article click navigates, fuzzy typing filters, keywords match |
| `tests/components/layout/app-sidebar-command-palette.test.tsx` | Sidebar search button opens the palette |

## Design Decisions

- **Dedicated store, not a CustomEvent.** Per the CLAUDE.md
  "Avoid DOM `CustomEvent`s when props, router state, or context
  will do" rule. A zustand store is testable, type-safe, and traceable
  with a single grep.
- **Mounted at `<App>`, not inside a route.** Per the same pattern as
  `RulesEditorDialog` and `SmartFilterEditorDialog`. Opening the
  palette mid-navigation must not unmount it.
- **Actions module is a pure factory.** Takes `{ navigate, theme }`
  rather than calling `useNavigate` / `useTheme` itself, so the
  module is testable without a `ThemeProvider` in the test wrapper
  and the action set can be re-derived from any context (e.g. for
  programmatic action invocation later).
- **Theme via the parameterised API.** `buildCommandActions` accepts
  a `ThemeApi` instead of importing `useTheme` from `next-themes`.
  Same reason — keeps the unit test surface minimal.
- **cmdk's built-in fuzzy match.** No custom scoring. cmdk also
  handles keyboard nav, ARIA, and `data-selected` semantics; we just
  declare items. Re-evaluate when full-text search lands.
- **`keywords` field on every action.** Lets a user typing "subscribe"
  find "Add a feed" without the label needing to contain the word.
- **Articles capped at 50.** cmdk renders all items in the DOM; an
  uncapped list with 10k articles tanks open latency. The proper
  fix is the inverted-index search engine (follow-up).
- **Open shortcut runs before the input-focus early return.** Without
  this, the palette would be unsummonable from the explore search
  box or the import textarea — exactly where users most want it.
- **Sidebar search button.** Hotkey-only features are invisible to
  users who don't already know about them. A visible button with a
  tooltip showing the shortcut converts hover into learning.

## Limitations

- **Article search is loaded-list only.** The palette shows only the
  first 50 articles from the currently-loaded list. Searching across
  the full encrypted article corpus needs the inverted-index engine
  (MiniSearch + encrypted Dexie store), tracked as the follow-up
  feature 023.
- **No recents / pinned.** Every open starts on the default action
  list with no memory of last-used items. The follow-up could
  localStorage-persist the last N invocations and surface them as
  a "Recent" group above Actions.
- **No global text shortcut chord.** Linear's `G F` (go feeds)
  pattern is not implemented; users press ⌘K then type "feeds".
- **No mobile optimisation pass.** The palette renders as the
  standard dialog on mobile; on small screens the typing-keyboard +
  results-list interaction needs a UX review (current state is
  functional but not great).
- **No full-text body search.** Article matching is title-only;
  matching on body text waits on the inverted index.
