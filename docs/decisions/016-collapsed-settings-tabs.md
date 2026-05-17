# ADR 016: Collapse Settings into Subscription + Sync & Data

## Status

Accepted (2026-05-17).

## Context

The previous Settings layout split licensing across three tabs (Subscription,
Recovery, Data) and exposed the cloud sync controls as a row of inline
buttons (Enable sync, Use existing cloud account, Switch to local only,
Restore from cloud, Log out). The two flows that paid users hit most often —
"activate the license I already bought" and "turn cloud sync on/off" —
were buried:

- **License activation** was a muted `Log in` link inside the
  `<SubscriptionUpgrade>` pricing comparison. Returning users hunting for
  somewhere to paste their `fz_…` token wandered through three tabs.
- **Cloud sync** was four buttons that all looked the same destructive-or-
  not. Users on the Free tier could press `Enable sync`, trip the server's
  401 `license required`, and land in a "subscribe vs keep local vs
  self-host" migration dialog they hadn't asked for.
- **Lost-passphrase** lived in a large amber warning box that rendered for
  every Data-tab visitor — including local-only users who had no
  passphrase to lose.
- **Delete all data** was gated behind a Stripe-cancellation step for paid
  users, which conflated billing and data hygiene (and trapped people who
  legitimately wanted both — cancel later, delete now).

## Decision

Reshape the Settings page around two primary concerns:

| Tab | Answers |
|-----|---------|
| **Subscription** | "What plan am I on, and how do I activate / pay for it?" |
| **Sync & Data**  | "Where does my data live, and how do I move it?" |

Reading and Help stay unchanged. Recovery is folded into Subscription (its
license-paste form, email recovery link, and contact-support card all move
there or to Help). Self-hosters never see Subscription — the redirect
default tab is Sync & Data.

### Subscription tab

- **Free users** see a tier badge, a single full-width "Activate existing
  license" primary CTA, a "Lost your license?" recovery link, an `or
  subscribe` divider, and the tier comparison cards (Free / Personal /
  Pro / Self-host).
- **Paid users** see the existing tier card (renewal date, masked token
  with reveal / copy, Manage subscription, Deactivate), plus a compact
  "Looking for a different plan?" strip with only the alternative tier
  cards (upgrade / downgrade).
- The "Activate existing license" CTA opens a Dialog around the existing
  `<LicenseTokenPasteForm>`. No new state machine, no new wizard.

### Sync & Data tab

The primary affordance is one Radix `<Switch>`:

- **OFF → ON**: opens a chooser dialog with two buttons — "Set up new
  cloud sync" (single-screen passphrase + checkbox + Enable) or
  "Connect existing cloud store" (always merge with local precedence; the
  replace/merge picker is gone).
- **ON → OFF**: opens the existing keep-vs-delete cloud-store fork
  (renamed "cloud store" for end-user clarity).

The toggle sits behind a blurred overlay with an "Upgrade plan" CTA when
the user is on the Free tier (hosted) — this eliminates the
license-required mid-flow failure for new users entirely (the existing
PendingMigration dialog still handles legacy users whose license expired
after enabling sync). Self-hosters get the same overlay pattern when a
HEAD probe of `/api/sync` fails (5xx / refused) — the dialog links to the
self-hosting docs.

The lost-passphrase warning shrinks from a full amber box to one muted
line, rendered only when sync is enabled. "Restore from cloud" and "Log
out of this device" move into a collapsed "Advanced actions" section.

"Delete all data and reset app" lives in its own Danger Zone card below
the sync section. It is always clickable regardless of license tier; for
paid users the confirmation dialog includes a non-blocking warning that
the Stripe subscription will keep billing and a "Manage subscription"
button to the portal — but does not block the delete.

### Routing

The `SettingsTab` union is now
`subscription | sync-and-data | reading | help`. Legacy URLs `?tab=recovery`
and `?tab=data` redirect (replace) to `?tab=subscription` and
`?tab=sync-and-data` respectively so deep-links shared before the
redesign keep working.

### Self-hosted mode (ADR 014 delta)

`<SettingsTabs>` filters out the Subscription tab when `isSelfHosted()`
returns true. The default tab becomes Sync & Data, and the sync toggle's
gate switches from license-tier to a HEAD probe of `/api/sync`. No
backend change: `methodHandlers.HEAD` was already wired (it reuses
`handleGet`, returning 200/404 depending on vault presence, or 400 for
the missing-vaultId probe path) and `SUPPORTED_METHODS` already includes
HEAD.

### OPML export mobile overflow

The URL-list textarea inside Export was overflowing the viewport on
mobile because the wrapper lacked `min-w-0` and the textarea lacked
`max-w-full` / `break-all` — `font-mono` + long URLs let intrinsic
content width push the box past the parent. Added `min-w-0` to the
wrapper, `min-w-0 max-w-full break-all` to the textarea, and `min-w-0`
to the Sync & Data tab's grid cells.

## Consequences

- One less tab to skim; two top-level surfaces (license, sync) each have
  a single primary action.
- Free users can't enter a sync flow that will fail server-side — the
  toggle isn't operable without an active license (or a reachable
  self-hosted server). The migration dialog for already-synced
  legacy-license users stays in place.
- The replace/merge picker is gone. Users who want a clean cloud copy
  use "Delete all data" first, then connect. Most users picked the
  default anyway; the picker mostly produced wrong-direction merges.
- Paid users can self-serve a full local reset without a Stripe detour;
  they get a clear billing warning but are not blocked.
- Deep-links to `?tab=recovery` and `?tab=data` continue to work via
  one-time URL replacement; bookmarks and old support emails are not
  broken.

## Rejected alternatives

- **Keep Recovery as a separate tab.** Three tabs for one concern (your
  license) was the original sin. Recovery contents fit naturally inside
  Subscription — paste, recover by email, contact support are all
  "things you do when your license isn't working".
- **Hide the sync toggle entirely for free users.** Considered, rejected
  — a visible-but-gated toggle teaches what's available behind the
  upgrade. Hidden controls leave free users guessing whether the feature
  exists at all.
- **Probe sync availability via a custom `/api/sync/health` endpoint.**
  Considered, rejected — the existing HEAD path already serves the same
  purpose without expanding the API surface. Any non-5xx response proves
  the route is mounted.
- **Block "Delete all data" for paid users.** This was the prior
  behavior and it caused real support volume (people who'd already
  decided to leave couldn't reset locally without filing a ticket). The
  honest UX is to warn and allow.
