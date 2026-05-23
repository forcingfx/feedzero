# ADR 014 — Self-host is a first-class deployment

**Status:** Accepted
**Date:** 2026-05-17
**Supersedes:** Tangential to ADR 012 (open-core feature gating)

## Context

Three feedback issues from a single user attempting to self-host on a
clean Ubuntu 26.04 box surfaced a coherent failure mode:

- **#88** — Loaded `http://<lan-ip>:3000`. Web Crypto failed. The error
  blamed "iOS Lockdown Mode." Reset hung.
- **#97** — Reverse-proxied (TLS) and unblocked. 14 feeds failed
  self-hosted (mostly 429, some 403, one "no RSS feed found") that
  succeed on `my.feedzero.app`.
- **#98** — Set `VITE_PAID_TIER_VISIBLE=` and `LAUNCH_PAID_TIER=`
  expecting to hide Subscribe UI. Still saw it. Cross-device LAN sync
  didn't work intuitively. Asked for dark mode and tighter docs.

Pattern: **self-hosted FeedZero is operationally distinct from the Vercel
reference deployment, but the codebase pretended they were identical**.
Vercel gives you HTTPS for free, an Upstash rate-limiter, and IP
reputation. Self-hosters get none of these and the app gave no warnings,
hints, or knobs to fix it. Every issue was a real defect *plus* a
messaging defect: the Web Crypto error blamed Lockdown Mode (wrong),
discovery returned "no feed found" on 429s (wrong), and three flags
controlled what should be one switch.

## Decision

Self-hosting is a supported first-class deployment with:

1. **A single master switch.** `VITE_SELF_HOSTED=1` (build) and
   `SELF_HOSTED=1` (runtime) are sufficient. `isPaidTierActive()`
   short-circuits to `false` under `isSelfHosted()`, and `isFlagEnabled`
   forces `LAUNCH_PAID_TIER` off when `SELF_HOSTED=1`. Self-hosters
   never coordinate flags.

2. **Insecure-context detection, not crypto-blaming.** A new
   `checkSecureContext()` helper distinguishes
   `!window.isSecureContext` (the common self-host symptom) from
   `crypto.subtle` missing (iOS Lockdown Mode / ancient browser).
   The error UI names the actual cause and links to the self-host guide.

3. **A reset that can't hang.** `resetApp()` races against a 5s
   timeout; on expiry, `localStorage.clear()` runs unconditionally so
   re-onboarding always succeeds.

4. **Self-host-aware proxy.** `pickUserAgent(env)` returns a
   browser-like UA when `SELF_HOSTED=1` (rationale: a self-host instance
   represents a single user, so a browser UA is honest, not evasive).
   `FEED_USER_AGENT` overrides for operators with their own contact UA.

5. **Honest discovery errors.** 429/403/5xx upstream statuses surface
   as specific messages, not "No RSS feed could be found."

6. **Friendlier sync-restore failures.** A 404 on `pullVault` (no cloud
   vault exists for the derived passphrase) returns a human message
   pointing at the two real causes — first device or passphrase typo —
   instead of the raw `Sync pull failed (404): Vault not found`.

7. **Docs reframed.** README points at the canonical self-host guide on
   the landing site, lists what self-hosters give up vs. Vercel, and
   stops pretending the two deployments are identical.

## Consequences

**Positive**

- Single env var to remember. Lower coordination cost in deployment recipes.
- The next #88-shaped report gets the right diagnosis immediately, with
  a link to the fix.
- Upstream WAFs are less likely to block self-host traffic on UA alone.
- Discovery errors stop misleading users into reporting "broken feeds"
  that are actually upstream rate-limits.

**Negative**

- Browser-like UA on self-host means upstream operators see one fewer
  RSS-reader fingerprint in their logs. We give them `FEED_USER_AGENT`
  as the escape hatch.
- The master-switch invariant adds a 1-line coupling between
  `paid-tier-active` and `self-hosted`. Tested via the
  "VITE_SELF_HOSTED=1 forces isPaidTierActive false" lock test, so a
  future change that breaks the coupling is caught.

**Followups** (deliberately out of scope for this ADR)

- A4-extras: ~~per-host serialization of `refreshAll()`~~ ✅ shipped
  via `groupByHostForRefresh`; ~~`Retry-After` consumption in the
  refresh worker~~ ✅ shipped via `src/core/feeds/host-pause.ts` — a
  429/503 on any feed pauses every other feed on the same host until
  the indicated time.
- A3: ~~in-app self-host preflight UI~~ ✅ shipped as
  `<PreflightPanel>` in Settings → Help, backed by
  `src/core/diagnostics/self-host-preflight.ts`.
- A8: ~~existing-vault detection on the second-device onboarding flow~~
  ✅ `RecoveryStep` now runs `checkVaultExists()` (HEAD-only) before
  the destructive `pullVault` + `initFresh` path. A 404 short-circuits
  with a precise "no vault matched that passphrase" message instead of
  the generic spinner-then-error, and a real network failure (5xx,
  CORS) surfaces verbatim so the user doesn't blame their passphrase.
- A7: ~~dark mode toggle surfaced in the sidebar~~ ✅ shipped as the
  Settings → Reading theme toggle plus vault-synced `<ThemeBridge>`
  (see ADR 022 follow-up).

## Lesson worth recording

**Every defect in this batch was a defect *plus* a messaging defect.**
The codebase had a correct `=== "1"` flag check, but the UI surfaces
that the flag controlled were inconsistent. The Web Crypto check
worked, but blamed the wrong cause. The discovery cascade returned
errors, but used the same error string for fundamentally different
failures. Future review checklists should explicitly ask: *what does
the user see when this fails, and does that message match the real
cause?*
