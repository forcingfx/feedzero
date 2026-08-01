# Feature 010: Mobile Navigation

## Status
Implemented (reader-as-overlay model, 2026-08)

## Summary

On mobile (< 1024px viewport) the article list fills the viewport and the reader is an **overlay layer** on top of it. Navigation is asymmetric by design: **tap goes in, swipe goes out**. Tapping an article mounts the reader layer (slides in from the right); an edge-swipe right (starting within ~28px of the left edge) follows the finger and dismisses it, as does the back pill. The list never horizontal-swipes into the reader and never unmounts while reading, so its scroll position survives the round trip. The URL stays the source of truth: the reader layer exists iff the route carries an `articleId`.

This replaced two earlier models: the original drill-down-with-back-buttons, and a horizontal snap-x pager (list and reader as side-by-side panels). The pager made the two surfaces feel physically connected — a leftward swipe on the list dragged the reader in — which fought the swipe-right-to-mark-read row gesture and lost list scroll position (PR #237 feedback).

## Behaviour

```gherkin
Feature: Mobile navigation

  Rule: Tap goes in, swipe goes out

  Scenario: Tap opens the reader overlay
    Given the user is viewing an article list on mobile
    When the user taps an article row
    Then the reader layer slides in over the list
    And the URL gains the articleId segment

  Scenario: Edge-swipe dismisses the reader
    Given the reader layer is open
    When the user drags rightward starting at the left screen edge
    Then the layer follows the finger
    And releasing past a third of the screen width returns to the list
    And the article list is unchanged (scroll position intact)

  Scenario: Mid-screen swipes belong to the content
    Given the reader layer is open
    When the user drags starting away from the left edge
    Then the reader does not dismiss

  Scenario: The list cannot swipe into the reader
    Given the user is viewing an article list on mobile
    When the user swipes leftward on the list
    Then no reader appears (rows own rightward swipe-to-mark-read;
      nothing owns leftward)

  Scenario: Back pill returns to the list without auto-redirect
    Given the user is viewing an article on mobile
    When the user taps the back pill
    Then the article list is displayed
    And the user is not auto-redirected to an article

  Rule: Auto-select is suppressed after Back navigation

  Scenario: User can browse article list after Back
    Given the user is viewing an article on mobile
    And the feed has multiple articles
    When the user taps the Back button
    Then the article list is displayed
    And the user can select a different article
    And no automatic navigation occurs

  Rule: An empty stage falls back to the article list

  Scenario: Viewed article disappears from cache
    Given the user is reading an article on mobile
    When that article is removed from the loaded set (e.g. the article cache is cleared)
    Then the user is navigated back to the article list
    And the reader is not left showing a blank stage

  Scenario: Deeplink to an already-empty feed does not bounce
    Given the user opens an article URL for a feed that loads no articles
    Then the user stays on that URL (the reader shows its own empty state)
    And no automatic back-navigation occurs

  Rule: The reader is a layer, not a sibling panel

  Scenario: Mobile shows the reader above the mounted list
    Given the user is on a mobile device (< 1024px)
    When viewing /feeds/:feedId/articles/:articleId
    Then the reader layer covers the viewport
    And the article list stays mounted beneath it
    And a deeplink to this URL shows the reader immediately

  Scenario: Desktop shows multi-panel layout
    Given the user is on a desktop device (>= 1024px)
    When viewing /feeds/:feedId/articles/:articleId
    Then the sidebar, article list, and reader are all visible
    And resizable panel handles allow layout adjustment

  Rule: The closed bottom drawer is a quick-switch favicon dock

  Scenario: Closed drawer surfaces recent feeds instead of the current feed name
    Given the user is on mobile with the bottom drawer closed
    Then the strip shows an anchored "All items" button
    And the favicons of the most-recently-viewed feeds in stable sidebar order
    And fixed Explore and Settings shortcuts beside the chevron
    And it does not repeat the current feed name (the header already shows it)

  Scenario: Dock slots never reorder under the thumb
    Given the dock shows a set of feed favicons
    When the user taps one of them
    Then the dock's buttons keep their positions
    And only viewing a feed from outside the dock swaps a slot

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

### Flow (closing the reader)

1. User edge-swipes right on the reader layer (or taps the back pill)
2. `closeReader()` sets `skipAutoSelectRef.current = true` and navigates
   to the parent route (`/feeds/:feedId`)
3. The reader layer unmounts (its existence is derived from `articleId`)
4. Auto-select effect checks `skipAutoSelectRef` and skips if true
5. Ref is reset only when the user explicitly navigates to an article

Gesture ownership map (mobile):
- **List rows**: rightward drag → toggle read; vertical → scroll; leftward → nothing.
- **Reader layer**: edge-zone rightward drag → dismiss; elsewhere → content scroll.
- **Article list top**: downward overscroll → pull-to-refresh.

### Files

| File | Role |
|------|------|
| `src/pages/feeds-route.tsx` | Mobile branch renders `<main>` (list) + conditional `<MobileReaderLayer>`; auto-select suppression; empty-stage→list fallback (present→absent transition guard) |
| `src/hooks/use-swipe-back.ts` | Edge-zone arming, finger-following `dragX`, commit past ⅓ width; non-passive touchmove for `preventDefault` |
| `src/hooks/use-media-query.ts` | `useIsDesktop()` hook for responsive breakpoint detection |
| `src/components/layout/mobile-nav-drawer.tsx` | Bottom drawer. Closed state = quick-switch favicon dock + Explore/Settings shortcuts; open state = full feed list + Refresh/Settings footer |
| `src/lib/recent-feeds.ts` | Pure `stableDockFeeds()` / `recordRecentFeed()` helpers + `MOBILE_DOCK_FEED_CAP` |
| `src/stores/feed-store.ts` | Tracks `recentFeedIds` (device-local, persisted) — recorded in `selectFeed`, pruned in `removeFeed` |

### Tests

| File | Coverage |
|------|----------|
| `tests/pages/feeds-page-behavior.test.tsx` | Back button navigation, auto-select suppression, URL state |
| `tests/components/layout/feeds-page-layout.test.tsx` | Mobile vs desktop layout structure, Back button visibility |
| `tests/components/layout/mobile-nav-drawer.test.tsx` | Closed-state quick-switch dock, open-state feed list/footer |
| `tests/lib/recent-feeds.test.ts` | Recency ordering, cap, dedupe |
| `tests/stores/feed-store.test.ts` | `selectFeed` records recency; `removeFeed` prunes it |

## Native-app feel (CSS + meta tag baseline)

These are app-wide rules, not navigation-specific, but they live alongside the mobile work because they're how the mobile web app stops feeling like a web page. All defined in `src/index.css` and `index.html`.

| Rule | Where | What it does |
|------|-------|--------------|
| `font-size: 16px` on `input, textarea, select, [contenteditable="true"]` at `max-width: 767px` | `src/index.css` (unlayered, after the `.dark` block) | Prevents iOS Safari's auto-zoom on input focus. Our `html { font-size: 14px }` makes Tailwind's `text-base` resolve to 14px, which trips Safari's `font-size < 16px → zoom in` heuristic. The rule sits OUTSIDE `@layer base` because utility classes (`text-base`, `text-sm`) live in `@layer utilities` and would otherwise win the cascade. |
| `-webkit-text-size-adjust: 100%` | `html` in `@layer base` | Pins the text scale in iOS landscape — without it the OS reflows fonts and breaks the tuned scale. |
| `-webkit-tap-highlight-color: transparent` | `body` in `@layer base` | Removes the gray flash iOS draws on every tap. The single biggest "I'm a web page" tell. |
| `overscroll-behavior-y: none` | `html, body` in `@layer base` | Kills the document-root rubber-band overscroll on iOS and Chrome Android's pull-to-refresh — neither belongs in an app shell. |
| `touch-action: manipulation` | `button, [role="button"], a, summary, [role="tab"], [role="menuitem"], label` in `@layer base` | Removes the 300ms double-tap-zoom delay on interactive elements so rapid taps feel instant. Form controls are excluded so text-selection / caret gestures stay intact. |
| `apple-mobile-web-app-capable=yes` + `mobile-web-app-capable=yes` | `index.html` | Standalone launch from Add-to-Home-Screen (drops the URL bar / tab strip). |
| `apple-mobile-web-app-status-bar-style=black-translucent` | `index.html` | App paints behind the iOS status bar; combined with the existing `env(safe-area-inset-top)` body padding, content stays clear. |
| `apple-mobile-web-app-title=FeedZero` | `index.html` | Sets the home-screen icon label on iOS. |

Test guards (Tier 2 structural): `tests/index-html-viewport.test.ts` (PWA meta tags) and `tests/index-css-native-feel.test.ts` (CSS rules + the *unlayered* placement of the iOS-zoom rule).

## Design Decisions

- **Ref-based skip flag** — Using a ref (`skipAutoSelectRef`) instead of state avoids re-renders while still persisting across the async article load cycle. The ref is reset only when `articleId` appears in the URL, ensuring the skip persists through multiple effect runs.

- **Reader as a layer, not a peer** — The snap-pager model made the list and reader feel like two connected panels; users read that as "swiping the list drags the reader in," which collided with row swipe-actions. A layer matches the iOS mental model (detail slides over master), frees every list gesture, and keeps the list mounted so scroll position is preserved for free. Entry is tap-only; exit is edge-swipe or back pill — asymmetric on purpose.

- **Auto-select only on feed switch** — Auto-selecting the first article when switching feeds improves UX by showing content immediately. But auto-select is suppressed after Back navigation because the user explicitly wanted to see the article list (to pick a different article).

- **Empty-stage fallback is a transition, not a state** — The reader bounces back to the article list only when the viewed article goes from *present* to *absent* (tracked with `viewedArticlePresentRef`). A deeplink to a feed that simply loads empty is left alone so the reader can show its own empty state — distinguishing "the thing I was reading vanished" from "there was never anything here."

- **Closed drawer is a dock, not a label** — The closed strip previously showed the selected feed's name next to a generic icon, duplicating the header. Since the drawer's job is cross-feed navigation, the closed state now previews *where you can go* — an anchored "All items" plus your most-recently-viewed feed favicons — rather than echoing *where you are*. Recency (`recentFeedIds`) is device-local and never syncs: it's a per-device interaction trail, and metering it server-side would contradict the privacy principles.

## Limitations

- Browser back/forward buttons may not trigger `handleBack()` — they navigate directly via the router. The `skipAutoSelectRef` logic only applies to the in-app Back button.
- Swipe gestures for navigation are not implemented.
