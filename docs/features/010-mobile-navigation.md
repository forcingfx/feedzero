# Feature 010: Mobile Navigation

## Status
Implemented

## Summary

On mobile devices (< 1024px viewport), FeedZero uses a single-panel navigation pattern with a Back button to navigate between views. The navigation follows a drill-down hierarchy: Feed List → Article List → Article Reader. The Back button respects user intent and does not auto-redirect to articles when the user explicitly navigates back.

## Behaviour

```gherkin
Feature: Mobile navigation

  Rule: Back button navigates up the hierarchy

  Scenario: Back from article shows article list
    Given the user is viewing an article on mobile
    When the user taps the Back button
    Then the article list is displayed
    And the user is not auto-redirected to an article

  Scenario: Back from article list shows feed sidebar prompt
    Given the user is viewing an article list on mobile
    When the user taps the Back button
    Then the user is navigated to /feeds
    And a prompt to open the sidebar is shown

  Scenario: Back button is hidden at root
    Given the user is at the /feeds root on mobile
    Then the Back button is not displayed

  Rule: Auto-select is suppressed after Back navigation

  Scenario: User can browse article list after Back
    Given the user is viewing an article on mobile
    And the feed has multiple articles
    When the user taps the Back button
    Then the article list is displayed
    And the user can select a different article
    And no automatic navigation occurs

  Rule: Mobile layout is single-panel

  Scenario: Mobile shows one content panel at a time
    Given the user is on a mobile device (< 1024px)
    When viewing /feeds/:feedId/articles/:articleId
    Then only the reader panel is visible
    And the article list is not visible
    And the sidebar is collapsed to offcanvas

  Scenario: Desktop shows multi-panel layout
    Given the user is on a desktop device (>= 1024px)
    When viewing /feeds/:feedId/articles/:articleId
    Then the sidebar, article list, and reader are all visible
    And resizable panel handles allow layout adjustment
```

## Architecture

### Flow

1. User taps Back button in mobile header
2. `handleBack()` sets `skipAutoSelectRef.current = true`
3. Navigation occurs via `navigate()` to parent route
4. Auto-select effect checks `skipAutoSelectRef` and skips if true
5. Ref is reset only when user explicitly navigates to an article

### Files

| File | Role |
|------|------|
| `src/pages/feeds-page.tsx` | Main page component with mobile/desktop layout switching, Back button handler, and auto-select suppression logic |
| `src/hooks/use-media-query.ts` | `useIsDesktop()` hook for responsive breakpoint detection |

### Tests

| File | Coverage |
|------|----------|
| `tests/pages/feeds-page-behavior.test.tsx` | Back button navigation, auto-select suppression, URL state |
| `tests/components/layout/feeds-page-layout.test.tsx` | Mobile vs desktop layout structure, Back button visibility |

## Design Decisions

- **Ref-based skip flag** — Using a ref (`skipAutoSelectRef`) instead of state avoids re-renders while still persisting across the async article load cycle. The ref is reset only when `articleId` appears in the URL, ensuring the skip persists through multiple effect runs.

- **Stack-based navigation** — Mobile navigation follows the standard iOS/Android pattern: Article → Article List → Feed List. This matches user mental models for drill-down interfaces.

- **Auto-select only on feed switch** — Auto-selecting the first article when switching feeds improves UX by showing content immediately. But auto-select is suppressed after Back navigation because the user explicitly wanted to see the article list (to pick a different article).

## Limitations

- Browser back/forward buttons may not trigger `handleBack()` — they navigate directly via the router. The `skipAutoSelectRef` logic only applies to the in-app Back button.
- Swipe gestures for navigation are not implemented.
