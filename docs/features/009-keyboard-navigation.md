# Feature 009: Keyboard Navigation

## Status
Implemented

## Summary

Power users can navigate the feed reader entirely via keyboard shortcuts. All shortcuts have verified behavior parity with their UI counterparts — pressing a key produces identical outcomes to clicking the equivalent button.

## Shortcuts Reference

| Key | Action | UI Equivalent |
|-----|--------|---------------|
| **J** | Next article | Click article in list |
| **K** | Previous article | Click article in list |
| **U** | Next feed | Click feed in sidebar |
| **I** | Previous feed | Click feed in sidebar |
| **O** | Open original in new tab | Click "Original" link |
| **E** | Toggle Feed/Extracted view | Click view toggle buttons |
| **N** | Open add feed form | Click "Add Feed" button |
| **[** | Toggle sidebar | Click sidebar trigger |
| **R** | Refresh all feeds | Click "Refresh" button |

## Behaviour

```gherkin
Feature: Keyboard navigation

  Rule: Article navigation with J/K

  Scenario: Navigate to next article with J
    Given the user is viewing a feed with multiple articles
    When the user presses "J"
    Then the next article is selected
    And the article is marked as read
    And the reader panel shows the article content
    And the article scrolls into view

  Scenario: Navigate to previous article with K
    Given the user is viewing a feed with multiple articles
    And an article other than the first is selected
    When the user presses "K"
    Then the previous article is selected
    And the article is marked as read

  Scenario: J at last article stays at last
    Given the user is viewing the last article in a feed
    When the user presses "J"
    Then the selection remains on the last article

  Scenario: K at first article stays at first
    Given the user is viewing the first article in a feed
    When the user presses "K"
    Then the selection remains on the first article

  Scenario: J/K with no articles does nothing
    Given the user is viewing an empty feed
    When the user presses "J" or "K"
    Then nothing happens

  Rule: Feed navigation with U/I

  Scenario: Navigate to next feed with U
    Given the user has multiple feeds
    When the user presses "U"
    Then the next feed is selected
    And the old articles are cleared immediately
    And the article list loads that feed's articles
    And the URL updates to /feeds/:feedId

  Scenario: Navigate to previous feed with I
    Given the user has multiple feeds
    And a feed other than the first is selected
    When the user presses "I"
    Then the previous feed is selected
    And the article list loads that feed's articles

  Scenario: U at last feed stays at last
    Given the user is viewing the last feed
    When the user presses "U"
    Then the selection remains on the last feed

  Scenario: I at first feed stays at first
    Given the user is viewing the first feed
    When the user presses "I"
    Then the selection remains on the first feed

  Rule: Open original article with O

  Scenario: Open original link
    Given an article is selected
    When the user presses "O"
    Then the article's original link opens in a new tab
    With noopener and noreferrer for security

  Scenario: O with no article selected does nothing
    Given no article is selected
    When the user presses "O"
    Then nothing happens

  Rule: Toggle view mode with E

  Scenario: Toggle from Feed to Extracted
    Given an article is selected in Feed view
    And the article has an extractable link
    When the user presses "E"
    Then the view switches to Extracted mode
    And the full article is fetched via the CORS proxy
    And the extracted content is displayed

  Scenario: Toggle from Extracted back to Feed
    Given an article is displayed in Extracted view
    When the user presses "E"
    Then the view switches back to Feed mode
    And the original feed content is displayed

  Scenario: E with cached extraction uses cache
    Given an article's extracted content is already cached
    When the user presses "E"
    Then the cached content is displayed immediately
    And no network request is made

  Scenario: E with no article selected does nothing
    Given no article is selected
    When the user presses "E"
    Then nothing happens

  Rule: Add feed with N

  Scenario: Open add feed form
    When the user presses "N"
    Then the add feed form opens in the sidebar
    And the URL input is focused after a brief delay

  Scenario: Close form with Escape
    Given the add feed form is open
    And the input is focused
    When the user presses "Escape"
    Then the form closes

  Rule: Toggle sidebar with [

  Scenario: Close sidebar
    Given the sidebar is open
    When the user presses "["
    Then the sidebar closes

  Scenario: Open sidebar
    Given the sidebar is closed
    When the user presses "["
    Then the sidebar opens

  Rule: Refresh feeds with R

  Scenario: Refresh all feeds
    Given the user has feeds
    When the user presses "R"
    Then all feeds are refreshed in background
    And new articles appear in the list
    And the refresh button shows "Refreshing..." state

  Scenario: R while already refreshing is ignored
    Given a refresh is already in progress
    When the user presses "R"
    Then no additional refresh starts

  Rule: Shortcuts are disabled in input fields

  Scenario: Shortcuts ignored when typing in input
    Given the user is focused on an input field
    When the user presses any shortcut key (j, k, u, i, o, e, n, r, [)
    Then the key is typed normally
    And no shortcut action is triggered

  Scenario: Shortcuts ignored when typing in textarea
    Given the user is focused on a textarea
    When the user presses any shortcut key
    Then the key is typed normally

  Scenario: Shortcuts ignored in contenteditable
    Given the user is focused on a contenteditable element
    When the user presses any shortcut key
    Then the key is typed normally
```

## Architecture

### Flow

1. `useKeyboardNav()` hook attaches a `keydown` listener to `document`
2. Listener checks if target is input/textarea/contenteditable — if so, returns early
3. Switch statement routes key to appropriate handler function
4. Handler functions either:
   - Dispatch custom events (`feedzero:add-feed`, `feedzero:toggle-sidebar`)
   - Call store actions directly (`refreshAll`, `toggleViewMode`)
   - Simulate DOM clicks on UI elements (article items, feed buttons)
5. `e.preventDefault()` stops default browser behavior for handled keys

### Key Design: DOM Click Delegation

Article navigation (J/K) and feed navigation (U/I) work by finding and clicking actual DOM elements rather than calling store actions directly. This ensures:

1. **Behavior parity** — Keyboard does exactly what clicking does
2. **URL navigation** — Click handlers include `navigate()` calls that update the URL
3. **Side effects** — All click-handler side effects (mark as read, load articles) happen automatically
4. **Single source of truth** — No duplicated logic between keyboard and click handlers

### Files

| File | Role |
|------|------|
| `src/hooks/use-keyboard-nav.ts` | Keyboard event handling, routing to actions |
| `src/stores/extraction-store.ts` | `toggleViewMode()` action for E key |
| `src/stores/feed-store.ts` | `refreshAll()` action for R key |
| `src/components/layout/app-sidebar.tsx` | Listens for `feedzero:add-feed` event |
| `src/pages/feeds-page.tsx` | Listens for `feedzero:toggle-sidebar` event |

### Tests

| File | Coverage |
|------|----------|
| `tests/hooks/use-keyboard-nav.test.tsx` | 29 tests: all shortcuts, boundary conditions, input field exclusion |
| `tests/integration/view-toggle-parity.test.tsx` | 5 tests: E key vs click behavior parity |
| `tests/integration/keyboard-ui-parity.test.tsx` | Cross-path parity for all shortcuts |

## Design Decisions

- **DOM click delegation for navigation** — J/K and U/I find and click actual DOM elements. This guarantees identical behavior to mouse clicks without duplicating navigation logic.
- **Custom events for UI state** — N and [ dispatch custom events rather than manipulating React state directly. This decouples the keyboard handler from component internals.
- **Direct store calls for actions** — E and R call store actions directly since they don't involve navigation or UI state that's managed by React.
- **Input field exclusion** — Checks `tagName` and `isContentEditable` to avoid intercepting typing. Uses early return, not event bubbling.
- **Scroll into view** — After J/K selection, `scrollIntoView({ behavior: "smooth", block: "nearest" })` ensures the selected article is visible.

## Behavior Parity Principle

All keyboard shortcuts must produce **identical outcomes** to their UI counterparts:

| Shortcut | Must Match |
|----------|------------|
| J/K | Clicking article item: selects, marks read, updates URL |
| U/I | Clicking feed button: selects feed, clears articles, loads new articles, updates URL |
| E | Clicking view toggle: switches mode, fetches extraction if needed |
| N | Clicking add button: opens form, focuses input |
| [ | Clicking sidebar trigger: toggles sidebar state |
| R | Clicking refresh button: refreshes all feeds |

If a keyboard path ever diverges from its UI path, it's a bug. Tests verify parity by checking both paths produce the same store state and side effects.

## Limitations

- No customizable key bindings — shortcuts are hardcoded
- No vim-style command mode or key sequences
- No shortcut for marking article as unread
- No shortcut for deleting feeds
- Sidebar must be open for U/I to find feed buttons
