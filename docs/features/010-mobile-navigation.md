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

  Rule: The closed bottom drawer is a quick-switch favicon dock

  Scenario: Closed drawer surfaces recent feeds instead of the current feed name
    Given the user is on mobile with the bottom drawer closed
    Then the strip shows an anchored "All items" button
    And the favicons of the most-recently-viewed feeds, newest first
    And it does not repeat the current feed name (the header already shows it)

  Scenario: Tapping a dock favicon switches feed without opening the drawer
    Given the closed drawer dock shows a feed's favicon
    When the user taps that favicon
    Then the app navigates to that feed
    And the drawer stays closed

  Scenario: Overflow lives behind the full list
    Given the user has more feeds than fit the dock cap
    Then only the most-recently-viewed feeds (up to MOBILE_DOCK_FEED_CAP) show
    And the chevron opens the full feed list for the rest
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
| `src/components/layout/mobile-nav-drawer.tsx` | Bottom drawer. Closed state = quick-switch favicon dock; open state = full feed list + Refresh/Settings footer |
| `src/lib/recent-feeds.ts` | Pure `orderFeedsByRecency()` / `recordRecentFeed()` helpers + `MOBILE_DOCK_FEED_CAP` |
| `src/stores/feed-store.ts` | Tracks `recentFeedIds` (device-local, persisted) — recorded in `selectFeed`, pruned in `removeFeed` |

### Tests

| File | Coverage |
|------|----------|
| `tests/pages/feeds-page-behavior.test.tsx` | Back button navigation, auto-select suppression, URL state |
| `tests/components/layout/feeds-page-layout.test.tsx` | Mobile vs desktop layout structure, Back button visibility |
| `tests/components/layout/mobile-nav-drawer.test.tsx` | Closed-state quick-switch dock, open-state feed list/footer |
| `tests/lib/recent-feeds.test.ts` | Recency ordering, cap, dedupe |
| `tests/stores/feed-store.test.ts` | `selectFeed` records recency; `removeFeed` prunes it |

## Design Decisions

- **Ref-based skip flag** — Using a ref (`skipAutoSelectRef`) instead of state avoids re-renders while still persisting across the async article load cycle. The ref is reset only when `articleId` appears in the URL, ensuring the skip persists through multiple effect runs.

- **Stack-based navigation** — Mobile navigation follows the standard iOS/Android pattern: Article → Article List → Feed List. This matches user mental models for drill-down interfaces.

- **Auto-select only on feed switch** — Auto-selecting the first article when switching feeds improves UX by showing content immediately. But auto-select is suppressed after Back navigation because the user explicitly wanted to see the article list (to pick a different article).

- **Closed drawer is a dock, not a label** — The closed strip previously showed the selected feed's name next to a generic icon, duplicating the header. Since the drawer's job is cross-feed navigation, the closed state now previews *where you can go* — an anchored "All items" plus your most-recently-viewed feed favicons — rather than echoing *where you are*. Recency (`recentFeedIds`) is device-local and never syncs: it's a per-device interaction trail, and metering it server-side would contradict the privacy principles.

## Limitations

- Browser back/forward buttons may not trigger `handleBack()` — they navigate directly via the router. The `skipAutoSelectRef` logic only applies to the in-app Back button.
- Swipe gestures for navigation are not implemented.
