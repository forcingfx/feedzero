# ADR 015: Stripe-Side 30-Day Free Trial

## Status
Accepted (2026-05-17).

## Context

Pre-trial, every Personal-tier subscriber paid $5 (monthly) or $50 (yearly) upfront before seeing whether cloud sync, auto-organize, and unlimited feeds fit their workflow. The activation bar was the dollar charge: a free user who liked the product still had to commit money to try the Personal features end-to-end on their own data.

We wanted to lower that activation bar with a 30-day free trial. The integration had to remain boring — FeedZero's billing surface area is already wide (Stripe Checkout, webhook, license issuance, vault sync, recovery) and a new tier or a new local trial clock would multiply edge cases (cross-device drift, clock tampering, expiry-vs-renewal races) without a matching revenue case.

## Decision

**Stripe owns the trial clock; FeedZero adds 13 lines of code and 4 lines of UI copy.**

- **`subscription_data.trial_period_days: 30`** is injected by `src/core/stripe/checkout-handler.ts` on every Checkout Session it creates. The trial duration is a hardcoded `TRIAL_PERIOD_DAYS` constant, not env-flagged and not Dashboard-configured.
- The webhook (`src/core/stripe/webhook-handler.ts`) reads `current_period_end` off `customer.subscription.created` and pins the issued license to it. Existing `invoice.paid → recordRenewal` extends the license to the next period when Stripe charges on day 31.
- No new `LicenseTier`. A trialing customer carries `tier=personal` with `expirySec` set to the trial end. Feature gates need zero changes.
- No new client-side state (`localStorage`, store, UI badge). The license-store already exposes `tier`; the trial is invisible to the app layer.
- Cancellation during trial flows through the existing `customer.subscription.deleted → revoke` path.

### Mode matrix (delta from ADR 012)

| Mode | Trial behavior |
|---|---|
| **Hosted prod** (my.feedzero.app) | Every new Checkout Session opens with a 30-day trial. Customer card stored; auto-charged on day 31. |
| **Self-hosted** | No effect — self-hosted bypasses tier gates entirely (ADR 014). |
| **Dev / local** | No Stripe involvement; flag stays dormant. |

## Rejected alternatives

- **Env var (`STRIPE_TRIAL_PERIOD_DAYS=30`)** — Premature configurability. Monetary terms belong in code review history, not in a dashboard. Per CLAUDE.md "Principles → Design": flags-and-toggles are debt. Promote when there's a real reason to A/B.
- **Stripe Dashboard `trial_period_days` on the Price object** — Moves a security-relevant business rule out of git. Risks silent staging-vs-live drift; risks a Dashboard click during an incident; risks the trial setting "expiring" after a Price-archive-and-recreate cycle. Source-of-truth must live in code.
- **Client-supplied `trialPeriodDays` in the POST body** — An attacker would just pass `trial_period_days: 365`. The server must own monetary terms (same reason `allowedPrices` is server-side).
- **New `LicenseTier = "free-trial"`** — A second pathway through `feature-gates.ts` for no functional gain. Trialing customers should see exactly what paying customers see; differentiating them in the type system invites accidental gating.
- **Client-side trial flag (`feedzero:trial-started-at` in localStorage)** — Trivially reset (clear storage → fresh 30 days). Requires building expiry/renewal logic FeedZero would otherwise outsource to Stripe.
- **Stripe coupon (100% off first month)** — Functionally identical from the customer's perspective, but Stripe couponing has a different metadata footprint (`discount.coupon.id` on invoices) that the recovery + admin scripts don't yet read. `trial_period_days` rides the existing webhook paths.

## Consequences

**Positive:**
- Zero new state. Token shape, store shape, gate function signature all unchanged.
- Cancellation, renewal, and revocation all reuse the production code paths that already had ~3 months of soak. The trial is just "a subscription that hasn't billed yet."
- Sunset is `git revert` — one constant + one inject point.

**Negative:**
- **Abuse vector**: trivial to claim a trial twice with different emails or with email aliases (`user+1@gmail.com`, `user+2@…`). Stripe does not block this natively. Defer mitigation; revisit if smoke metrics show abuse.
- **No app-side "trial: 5 days left" UI**. The license payload doesn't carry a trialing-vs-active flag. Users see Personal features unlocked from day 0 and have to look at their Stripe dashboard or email receipts for the trial-end date. Future ADR if we want to surface it.
- **Yearly subscribers also get 30 days free**, not 30 days into a $50 commitment. This is the same trial as monthly — a 30-day try-out followed by a year of billing. Acceptable.

## Cross-references

- [ADR 012 — Open-core feature gating](012-open-core-feature-gating.md) — trialing customers carry `tier=personal`; gates work as-is.
- [ADR 014 — Self-host first class](014-self-host-first-class.md) — self-hosted mode is unaffected; trial only applies to the hosted product.
- [Feature 014 — Stripe trial](../features/014-stripe-trial.md) — operational details.
