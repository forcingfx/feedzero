# Audit 2026-Q4: a calmer, leaner FeedZero

Run on 2026-11-10 at the owner's request ("calmer, simpler, powerful and
intuitive; keep the speed"). Scope: UX, security, privacy, usability,
speed. This memo is the spec for branch `audit/calmer-app`; one commit per
finding, smallest risk first. The owner pre-approved execution; the branch
is for testing, not merged by the audit.

## Detector deltas vs the 2026-03 lap

- A (toHaveBeenCalled): 526 → 555
- B (implementation-shaped names): 630 → 637
- C (store tests mocking db): 2 → 2
- D (dialog-not-visible): 0 → 0
- E (E2E onboarding bypass): 4 → 2
- Fix ratio (3 months): 12 / 49 = 24% (target < 15%; 25% is the smell line)
- Boundary violations (core/stores importing UI): 0
- Store↔store `getState` edges: sync 13, feed 10, article 8, prefs 5,
  license 5, four stores with 1–2. Wider than the documented triangle.
- Waivers: none. Dependabot majors: 2 (vitest 5), closed with reason.

## Measurements

- Eager JavaScript on first load: 17 files, about 437 kB gzipped. Cold
  load of the production build: desktop 65 ms DOMContentLoaded; emulated
  3G phone with 4× CPU slowdown 2.8 s, 1.47 MB transferred (the service
  worker precaches the hashed assets on install).
- The eager `vendor` chunk (499 kB raw, 174 kB gzipped) is 29% `motion`
  (one `<motion.div>` in `feeds-route.tsx`), 15% `hash-wasm` (lazily
  imported in `argon2.ts`, but the chunking rule hoists it into the eager
  chunk), 7% `fast-xml-parser` + `entities`, 6% `tailwind-merge`.
- The eager `index` chunk (222 kB) carries `core/signal` (7%) and
  `core/briefings` (4%) for every visitor through the stores.
- UI surface: 25 dialog/sheet components outside `ui/`, 52 toast call
  sites (most announce routine successes), 7 files with native `<select>`,
  0 with the shadcn `Select`, 11 icon-only buttons without `aria-label`,
  13 text sites at 9–11 px, about 80 hard-coded accent colours
  (amber/emerald/violet/green) outside the token system.
- Security headers present on both hosts: CSP (`img-src 'self' data:
  https:`), HSTS, `Referrer-Policy: no-referrer`, Permissions-Policy. No
  direct third-party fetch from the client; SSRF validator on every proxy
  path. The `/api/icon?url=` image proxy has no content-type or size cap.

## Finding 1 — Cap the image proxy (security, privacy)

**Costs:** `/api/icon?url=` fetches any URL the validator allows and
returns whatever comes back, uncapped. It now also serves article lead
images, so a feed can point every row at a multi-megabyte file or a
non-image, and the function buffers all of it.
**Buys:** a content-type allowlist (`image/*`) and a byte cap (2 MB) close
the amplification path and keep responses inside Vercel's 4.5 MB body
limit. Same code on all three entry points.
**Why now:** issue #340 multiplied the number of proxied images per screen.
**Sized:** small.

## Finding 2 — Cut the eager bundle by about a fifth (speed)

**Costs:** about 90 kB gzipped of the first load is a 500-line animation
library used for one slide-in and a WASM hasher that only runs when a
passphrase is derived. Users praise the speed; the first load on a phone
is where it is weakest.
**Buys:** the `motion` code is the swipe-back gesture itself, which the
gesture rules forbid rebuilding without real hardware, so it stays as it
is and moves into a lazy chunk: desktop never mounts the layer and a phone
needs it only once an article is open. `hash-wasm` gets its own chunk so
its existing lazy import stays lazy. Measured: eager gzipped JS 437 kB →
387 kB (the vendor chunk 174 kB → 120 kB); the mobile navigation E2E spec
passes unchanged.
**Why now:** the fix is mechanical and the measurement is in hand.
**Sized:** small.

## Finding 3 — One quiet palette and a readable type floor (UX consistency)

**Costs:** folder headers in the sidebar are full-width saturated fills;
fetch errors are red badges beside feed names; status chips mix amber,
emerald, violet and green by hand; 13 labels sit at 9–11 px; 11 icon
buttons have no accessible name. The app reads as louder than its content.
**Buys:** semantic tokens (`success`, `warning`, `info`, `accent`) in
`index.css` used everywhere a hard-coded accent is today; folder colour as
a left bar and tinted text instead of a filled row; errors as a muted
warning glyph with a tooltip; `text-xs` as the floor; every icon button
labelled. Light and dark mode stay consistent by construction.
**Why now:** the owner's brief names "calmer" first; this is the visible
half of it.
**Sized:** medium.

## Finding 4 — Quieter feedback (UX)

**Costs:** a floating "Mark N read" pill covers the last visible row of the
list; 52 toasts announce routine successes ("Feed added", "Link copied",
"Removed X") that the UI already shows; confirmation dialogs vary in
footer wording.
**Buys:** the mark-read action moves into the list header beside the sort
control; toasts remain for failures, for undo, and for multi-step results
(imports, bulk adds); dialog footers use one vocabulary (primary verb +
"Cancel", or "Close" alone).
**Why now:** Nielsen's "aesthetic and minimalist design" and "visibility of
system status" both point here, and it touches no data path.
**Sized:** medium.

## Finding 5 — Settings in the order people use them (usability)

**Costs:** Settings opens on "Subscription", a pricing page, before the
reading controls anyone came for. The Reading tab is eleven stacked cards.
**Buys:** tab order Reading, Sync & Data, Subscription, Help; the free
tier's Subscription tab shows one compact card with a "Compare plans"
disclosure instead of two full pricing cards.
**Why now:** three new Reading settings landed this month; the tab is the
busiest surface in the app.
**Sized:** small.

## Finding 6 — A shorter first screen (usability)

**Costs:** the onboarding modal stacks a three-step list, an alpha warning,
an import hint and two links before the one button that matters.
**Buys:** headline, one line, "Get started", and "Restore from cloud" as a
link; the alpha note becomes a single muted line; the import hint moves to
Explore, where importing happens.
**Why now:** it is the first thing every new user sees, and every piece of
it has a home elsewhere.
**Sized:** small.

## Deferred (proposed, not executed on this branch)

- **Standard mobile bottom bar.** The bar mixes recent-feed favicons with
  Explore, Settings and a chevron. A four-tab bar (Feeds, Explore, Signal,
  Settings) with recent feeds in the drawer would be the standard shape,
  but feature 010 owns a gesture map for that surface and step 8 of the
  workflow requires real hardware. Needs the owner on a phone first.
- **Keep Signal and briefings out of the boot path.** `index` carries their
  core modules because the stores import them at startup. Moving them
  behind the `/signal` route is a store refactor with sync implications.
- **Reader images through the proxy.** CSP allows `img-src https:`, so an
  opened article loads its images straight from the publisher. Routing
  them through `/api/icon?url=` would hide the reader's IP from the
  publisher at the cost of proxy bandwidth; a product decision.

## Refused

- Rewriting `db.ts` (1168 lines), `feed-store.ts` (1012) or
  `feed-service.ts` (891): big, but low churn and no recent bugs.
- Replacing native `<select>` with the shadcn `Select`: native is faster
  and better on phones; the fix is consistent styling, which Finding 3
  covers.
- Removing drag-and-drop (`@dnd-kit`, 15 kB gzipped): it is a feature.
- Chasing detector A/B counts: housekeeping, not a user's bug.
