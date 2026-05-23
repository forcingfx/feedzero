# ADR 023: Native iOS app via React Native (Expo), with Apple IAP for paid tiers

## Status
Accepted (2026-05-23). **Supersedes** the "Not now: native iOS/macOS/Android apps" line in `docs/strategy/003-playing-to-win.md` §2 *Where to Play* → *Surfaces*. The "Defer ... native apps" line in §*Focus* is narrowed to "native macOS / Android" — iOS moves to *Build*.

## Context

The "defer native" position in `003-playing-to-win.md` (last refreshed 2026-05-16) was sound when written: Reeder and NetNewsWire owned the iOS surface, our capability surface was thin, and a native rewrite would have meant duplicating logic we hadn't yet hardened. Three facts have shifted:

1. **The native surface is no longer settled.** `001-competitor-scan.md` (and `003` §4) records Reeder's iCloud sync as broken on iOS in 2026 — unread-count drift, slow background sync. NetNewsWire 7.0.4 shipped specifically to plug the gap for free users. The "Reeder + NNW own that surface" premise is partially false right now.
2. **Pocket refugees expect native.** `002-user-pain-points.md` §3 names a measurable competitive failure mode: "Native-app reviewers consistently weigh 'feels like a native iOS app' above raw features. Web wrappers/PWAs lose this comparison by default." The Pocket migration is the largest acquisition window of the past 19 months (`003` §2), and the privacy-conscious subset of those refugees lives on iPhones with the App Store as the default trust signal.
3. **The architecture is already paid for.** ADR 005 made `src/core/` framework-agnostic *specifically* to keep the React Native path open. Crypto, sync, parser, extractor, license, OPML, frequency engine, tier matrix, and every Zustand store import zero React. The expensive part of going native — the business logic — is already portable.

The PWA-plus-gaps compromise that `002` proposed (gestures, offline pre-fetch, TTS) closes some of the gap but does not produce an App Store listing. For the journalist / activist segment named in §1, App Store presence is itself part of the trust surface: it's where Apple has done identity, signing, and review work on our behalf. A PWA cannot substitute for that signal.

Apple's commerce rules force a second decision: paid tiers (Personal+, Pro) used *inside the app* must go through In-App Purchase. We could claim the "reader app" exemption (no IAP, no in-app upgrade UI, link out to web) but that splits the funnel and depresses conversion. We are willing to pay Apple's 15% / 30% cut to keep one upgrade flow on iOS.

## Decision

Ship FeedZero on iOS as a **React Native (Expo) app** that imports `src/core/` (extracted to `packages/core` via npm workspaces) and routes paid upgrades through **RevenueCat-mediated StoreKit 2 (Apple IAP)**. The web app, self-hosted Docker, and PWA remain first-class — iOS is additive, not replacement.

### Key choices

- **Stack: React Native via Expo (managed workflow + EAS Build + EAS Update).** EAS Update lets JS-only changes ship without App Review, matching the current web release cadence for non-native fixes.
- **Repo: npm-workspaces monorepo.** `packages/core` (shared TS — current `src/core/`, `src/utils/`, `src/types/`, `src/stores/`), `packages/web` (current SPA + `api/` + `server.ts`), `packages/mobile` (new Expo app). One git repo so a core change ships to both apps in one PR.
- **Platform adapters in `packages/core`.** Three browser APIs need RN equivalents: `crypto.subtle` (polyfilled via `react-native-quick-crypto`), IndexedDB/Dexie (re-implemented over `op-sqlite` or `expo-sqlite` behind a `StorageBackend` interface, same AES-GCM ciphertext + HMAC index columns), `localStorage` (replaced by `react-native-mmkv` behind a `KeyValueStore` interface). Web impls are the defaults; mobile registers its own at startup. The CLAUDE.md "mock at the boundary" rule pins contract tests at the adapter interface.
- **Billing: RevenueCat → server license token.** A new `api/revenuecat-webhook.ts` handler (using the three-entry-point pattern from ADR 007) mints the **same** license token format as the Stripe webhook. `license-store` does not learn about Apple vs Stripe; it sees one license. The tier matrix (CLAUDE.md "canonical tier matrix" invariant) remains the single source of truth — iOS pricing cards derive from `packages/core/features/tier-matrix.ts` exactly as the web cards do.
- **Cross-platform subscription identity is keyed on email; iOS paid tiers require sync to be enabled.** Local-only iOS users can still use the free tier indefinitely; upgrading triggers the sync-enablement flow first so the email becomes the cross-platform key. This pushes iOS purchasers toward the paid sync product, which is the strategic flywheel (`003` §3), at the cost of a small fraction of users who would have paid for local-only on iOS. Revisit if it depresses conversion materially.
- **Article rendering uses `react-native-webview`** for sanitized HTML; extraction stays a server call (`/api/page`) and DOMPurify runs inside the WebView's own document, not the Hermes JS runtime. This avoids porting the DOM-heavy Defuddle pipeline into native code.
- **Deeplinks honor the URL-as-source-of-truth invariant.** React Navigation `linking` maps `feedzero://feeds/:feedId/articles/:articleId` and Universal Links from `my.feedzero.app/feeds/...` to the same routes the web app uses. The AASA file must be live at `https://my.feedzero.app/.well-known/apple-app-site-association` before the App Store release.

### Phasing

The full plan lives in the session plan file; the headline shape is: Phase 0 strategy/ADR (this commit), Phase 1 monorepo conversion (~2 wk), Phase 2 platform adapters (~3 wk), Phase 3 mobile UI (~5–6 wk), Phase 4 IAP + Stripe reconciliation (~2 wk), Phase 5 native chrome + App Store submission (~2 wk), Phase 6 launch coordination (~1 wk). Total ~14–17 weeks.

## Consequences

### Positive
- Closes the native-app reviewer-bias gap named in `002-user-pain-points.md` §3 without re-implementing the business logic.
- Establishes App Store presence as a trust signal — currently the App Store is where journalist-segment users look first.
- Reuses ~100% of `src/core/` and Zustand stores; adapter work is bounded to three interfaces in `packages/core`.
- Validates ADR 005's "framework-agnostic core" thesis in production. The investment pays off here.
- Monorepo collapses the "landing + feedzero" coordination problem from CLAUDE.md into one extra package; cross-package changes are atomic.
- A new pull-mode for the privacy story: Apple's privacy-nutrition-label review becomes free third-party validation of the "Data Not Collected" claim.

### Negative
- **Apple takes 15% (Small Business Program) or 30% of IAP revenue.** Accepted as the cost of native distribution. Web upgrade flow remains unaffected.
- **Second billing source to reconcile.** RevenueCat-issued and Stripe-issued license tokens co-exist; the server must surface "where your subscription lives" so users manage it in the right place. Adds a class of edge cases (cancel-on-iOS-then-resubscribe-on-web, family sharing).
- **App Review is now in the critical path** for native UI / native binary changes. Mitigated by EAS Update for JS-only fixes, but a regression in native code costs us 1–7 days of review time. The smoke-test discipline from ADR 011 extends to a pre-submit checklist.
- **The PWA-only crowd loses a future-default.** We commit to maintaining PWA-friendly meta tags and mobile-drilldown navigation (Feature 010), but the headline mobile story shifts to "install from the App Store." Self-hosters keep the PWA path.
- **Native-app surface is a new attack surface.** Privacy nutrition label, in-app account deletion (Apple requirement since 2022), and StoreKit receipt validation are all places to get the privacy story wrong. Pre-submit Charles Proxy session attached to the App Review PR is mandatory.

### Neutral
- DB and sync formats are **unchanged**. iOS reads and writes the same encrypted Dexie schema (via the SQLite-backed `StorageBackend` impl with identical columns) and the same `VaultData` structure. Cross-device sync between iOS and web Just Works on day one.
- `SYNC.FORMAT_VERSION` / `DB_VERSION` are unchanged by this ADR.
- The "Apple-ecosystem-only users where NetNewsWire 7 already solves the problem for free" segment named in `003` §2 as not-for-us is unchanged. We are not trying to take NNW's audience; we are trying to give *our* audience (privacy-first, cross-platform) an iOS option.
- macOS and Android remain deferred. React Native makes Android cheaper later; macOS via Mac Catalyst is a free-ish byproduct of an iPad layout. Neither is in scope here.

## Alternatives considered

- **Capacitor wrap of the existing SPA.** ~4–6 weeks instead of 14–17. Rejected: the wrapper-WebView discount on "feels native" is exactly the gap `002` §3 names; shipping a wrapper would replicate the failure mode we're trying to escape. Acceptable as a beta channel if the React Native path slips, not as the launch product.
- **Native Swift / SwiftUI rewrite.** ~6+ months, ongoing divergence from web. Rejected: violates the ADR 005 "share core logic" thesis; doubles the maintenance surface for crypto, sync, and license code (the most safety-critical modules) where divergence is most dangerous.
- **Improved PWA only.** Cheap. Rejected: no App Store listing → no App Store trust signal for the journalist segment, no IAP path, and `002` §3 already classifies "PWA loses the comparison" as the failure mode.
- **Reader-app exemption (no IAP, link to web for upgrades).** Rejected: splits the upgrade funnel and adds a "you can't buy this here" UX moment at the point of highest intent. The Apple cut is real but the conversion loss from out-of-app upgrade is likely larger.
- **Local-only-on-iOS paid tier (Apple `originalTransactionId` as the cross-platform key).** Rejected for v1: pushes complexity into the license server for users who don't get cross-platform benefit anyway. Pushing iOS purchasers through sync is the right default; revisit if it kills conversion.

## References

- ADR 005 (React migration) — the framework-agnostic core decision this ADR cashes in
- ADR 007 (Vercel serverless bundling) — three-entry-point pattern the new RevenueCat webhook must follow
- ADR 011 (smoke tests in RGR) — extended to a pre-App-Review checklist
- ADR 012 (open-core feature gating) — tier matrix consumed by iOS pricing cards unchanged
- ADR 014 (self-host first-class) — unchanged; iOS is additive
- `docs/strategy/003-playing-to-win.md` §2 *Surfaces* — superseded line ("Not now: native iOS …"); refresh in the same commit as this ADR
- `docs/strategy/002-user-pain-points.md` §3 — native-app reviewer-bias finding that motivates this decision
- `docs/strategy/001-competitor-scan.md` — Reeder iCloud breakage, lire offline parity reference
- CLAUDE.md "Landing/feedzero contract changes are serialized" — extended to App Store release coordination in Phase 6 of the rollout plan
