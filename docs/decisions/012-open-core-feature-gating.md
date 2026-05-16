# ADR 012: Open-Core Feature Gating (Honor-System)

## Status
Accepted (2026-05-16).

## Context

The Free + Personal launch shipped (PRs #67, #69). Auto-organize is the first feature being relocated from Free to Personal, and more will follow (filters, mute-keywords, eventually Pro features like AI Signal, search, send-to-Kindle). Every new gated feature lands in the single FOSS repo at `forcingfx/feedzero` because:

- Splitting into two repos (an OSS core and a closed Personal/Pro extension) doubles the dev surface and breaks the one-checkout self-hosting story.
- The MIT license already permits a motivated user to fork and strip any gate. A more elaborate enforcement scheme buys cosmetics, not safety.
- Most paid features (auto-organize, future filters) are entirely client-side. There is no server check to bypass — the gate is honor-system either way.

Without a gating layer the choice is either "ship the feature to everyone" (cannibalizing the Personal SKU) or "feature is missing from self-hosters" (breaking the FOSS contract). We need a third option: one codebase, three deployment modes.

## Decision

A single repo with a small, well-tested gating layer:

- **`src/core/features/feature-gates.ts`** — pure capability map + `gateState(feature, tier, isSelfHosted)`. Three switches per feature: `requiredTier`, `status` (shipped / coming-soon), and the caller-supplied `isSelfHosted`. Reason codes (`ok`, `self-hosted-bypass`, `tier-locked`, `not-built`) drive UI copy.
- **`src/stores/license-store.ts`** — Zustand store. Tier is decoded synchronously from the stored license token (no HMAC check locally) and then confirmed asynchronously by `/api/license/verify`. Network failures keep the local tier; server rejection clears the token.
- **`src/hooks/use-feature-gate.ts`** — React consumer. Components call `useFeatureGate("auto-organize")` and get `{ enabled, reason, promptUpgrade }`.
- **`VITE_SELF_HOSTED=1`** — build-time flag. When set, every shipped feature returns `enabled: true, reason: "self-hosted-bypass"`. Coming-soon features stay locked (the code isn't there to enable).

### Mode matrix

| Mode | Flags | Subscribe UI | Tier gates | Sync auth |
|---|---|---|---|---|
| **Hosted prod** (my.feedzero.app) | client `VITE_PAID_TIER_VISIBLE=1`; server `LAUNCH_PAID_TIER=1` | visible | enforced (UI + defensive store guard) | bearer required |
| **Self-hosted** | `VITE_SELF_HOSTED=1` | hidden | bypassed | free (operator's own server) |
| **Dev / local** | neither | hidden | tier defaults to free; coming-soon features stay locked | free |

### Defense-in-depth at the store boundary

The UI gate (popover offering "Upgrade — $5/mo" instead of "Organize now") is the visible path. Stores also call `gateState` at the action level (`feed-store.applyAutoOrganize`) so that programmatic callers — a future keyboard shortcut, a script in the dev console, an extension — can't bypass the UI check. On a locked action, the store no-ops and toasts.

## Honor-system tradeoff

Anyone can fork the repo, set `VITE_SELF_HOSTED=1`, and self-host with full Personal features for free. They can. The MIT license already permits it. We accept this because:

- Personal is $5/mo. The convenience of a managed deployment with sync, automated updates, and zero maintenance exceeds the friction of forking and self-hosting for the vast majority of users.
- The features paid users actually pay for *include the hosted infrastructure* — cross-device sync needs a server they don't have to run. A self-hoster paying $0 already runs their own server, which is the value the hosted user is paying for.
- Stricter enforcement (server-issued capability tokens, client-side cryptographic gating, closed-source extension repos) is engineering work we don't have evidence justifies yet.

If/when revenue justifies tighter controls, candidates are:
- License-bound capability tokens (the server signs a "feature list" into the token; client verifies HMAC before enabling) — adds server complexity and a new key rotation path.
- A closed-source `feedzero-pro` extension repo (Sentry / Mattermost / Posthog model) — adds release coordination and a stronger Pro/FOSS boundary; revisit once Pro is actually shipping revenue-bearing features.

## Why decode tier client-side without HMAC verification

`license-store.refresh()` decodes the locally-stored token immediately and sets `tier` from the payload, then kicks off a server verify in the background. A malicious user could paste a forged token (claiming Personal/Pro) and see paid UI briefly until the server rejects it (~200ms). This is:

- Acceptable. Client-side gating is honor-system; the server is the source of truth for real paid features (cloud sync requires a valid bearer). Local features (auto-organize) are honor-system either way.
- Eliminating the local decode would mean a UI flash of "Free" on every page load for legitimate paid users — a worse experience for the 100% to protect against the ~0%.

## Consequences

- Future Personal/Pro features add an entry to `FEATURE_MAP` (`shipped` or `coming-soon`) and consume `useFeatureGate`. No new gating infrastructure required per feature.
- Self-hosting documentation (`README.md`) instructs operators to set `VITE_SELF_HOSTED=1` in `.env.production` before `npm run build:all`.
- "Coming soon" features can be added to the UI (e.g. on the upcoming pricing page redesign) by listing them with `gateState` returning `not-built` — no separate enablement path required.
- The store-level guard means tests that exercise `applyAutoOrganize` (and future gated actions) must seed the license-store tier; `useLicenseStore.setState({ tier: "personal" })` in `beforeEach` is the pattern.
- `LicenseStatusChip` now reads from the centralized store instead of doing its own verify. Future tier-displaying components do the same.

## Alternatives rejected

### Two repos (OSS core + closed extension)
The Sentry / Mattermost model. Strong boundary, but doubles release coordination, breaks the one-checkout self-host story, and is significant work to set up. Revisit if Pro features ship a meaningful surface and a separate repo becomes net-positive.

### Server-issued capability tokens
The license server signs a feature list into the token; the client cryptographically verifies before enabling. Real enforcement, real complexity. Worth it only if/when revenue from features that an honor-system fork could trivially strip becomes material.

### No gating — ship everything to everyone
Cannibalizes the Personal SKU before Personal has had time to find product-market fit. Free + Personal launched eight days ago.

### No self-hosted bypass — gates always-on
Breaks the FOSS contract. The repo is MIT-licensed; gating features behind a check that no fork can satisfy is hostile to self-hosters.

## References

- PRs #67, #69 (Free + Personal tier launch + Stripe webhook drift fix)
- `src/core/features/feature-gates.ts` (capability map)
- `src/stores/license-store.ts` (tier source)
- `src/hooks/use-feature-gate.ts` (React consumer)
- ADR 008 (Upstash as production data layer) — defines where the license storage lives
- ADR 011 (smoke tests in RGR) — defines verification posture for production behavior
