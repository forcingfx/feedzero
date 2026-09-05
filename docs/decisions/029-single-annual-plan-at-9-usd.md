# ADR 029: One Paid Plan, $9/year

## Status

Accepted (2026-09-04). Supersedes the tier structure in
[ADR 012](012-open-core-feature-gating.md) and the trial length in
[ADR 015](015-stripe-side-trial.md). Closes §5 and §6 of
`docs/operations/next-steps.md`.

## Context

FeedZero shipped Free + Personal ($5/mo or $50/yr) with an unlaunched Pro
("Coming 2026", `$19/mo` placeholder in the operations queue). Three things
about that structure had stopped being true:

**Pro had nothing to sell.** Every Pro-only row in the tier matrix was
`coming-soon` — full-text search, authenticated fetchers, send-to-Kindle,
commercial themes. ADR 024 already named the consequence when it moved Signal
Briefings down to Personal: *"Pro is hard to sell — pay more for the same things
plus a roadmap."* Pricing a tier whose entire value is unbuilt asks the customer
to fund a promise.

**The second axis was monthly-vs-yearly, and it earned nothing.** The yearly
plan was "a small secondary link beneath the monthly Subscribe CTA"
(`next-steps.md` §6). Two prices, two deeplink keys, two env vars, and a
churn-handling path, for a choice the customer had no real basis to make.

**The strategy already pointed here.** `docs/strategy/002-user-pain-points.md`
recommends structuring monetization as "(a) free tier that genuinely works …
(c) lightweight annual for sync infra", and warns against price-anchoring
against Feedly Pro+. The shipped pricing did neither.

## Decision

**One paid tier, $9/year, annual only.**

1. **Pro is retired**, not repriced. Its four coming-soon features move onto the
   paid tier with `status` unchanged, so the gate still reports `not-built` and
   nothing unlocked for anyone.
2. **The tier id stays `personal`.** Only the display label changes, to
   **Supporter**. Everything user-facing derives from `TIER_LABEL`, so the
   rename is one line; the license wire and Stripe price metadata are untouched.
3. **`pro` remains decodable on the wire.** `LicenseTier` keeps three values;
   the app-facing `Tier` narrows to two; `normalizeTier` maps between them at
   every boundary that reads a tier from outside the app.
4. **Free rises to 100 feeds**, matching Feedly and The Old Reader.
5. **The trial shortens to 14 days**, sourced from `PAID_PLAN.trialDays`.
6. **Licenses carry 7 days of grace** past the Stripe period end, applied on
   renewal only.
7. **Existing subscribers migrate at their next renewal**, via a Stripe
   Subscription Schedule per customer. No proration, no mid-period charge.

## Rationale

### Why $9/year is a coherent number and what it costs

It undercuts the market floor. `001-competitor-scan.md` records Miniflux's
$15/yr hosted plan as *"the floor for the entire RSS-as-a-service market"*;
Reeder+ is $10/yr, NewsBlur $36/yr. $9/yr sits below all of them.

This is defensible on the strategy's own terms — §1 defines winning as
**survival**, explicitly *not* "paid conversion", and the privacy architecture
is also a cost architecture: no plaintext server-side means no per-user storage
of anything expensive. A price that reads as "chip in for the infrastructure"
fits a product whose README already pitches sustainability over growth.

It should still be recorded plainly that **this is an 85% cut per existing
subscriber** ($60/yr → $9/yr on the monthly plan), applied to the whole book as
each renews. If the goal were revenue this would be the wrong move. The goal is
reach and durability, and the number is chosen accordingly.

### Why the free cap goes up at the same time

100 feeds is the competitive norm and it makes the free tier genuinely usable,
which `002` asks for directly. The cost is real and worth stating: **"unlimited
feeds" was the paid tier's lead bullet**, and cloud sync became free in v0.11.0.
Very few users hold 100 feeds, so the upgrade case now rests entirely on
auto-organize, offline prefetch, smart filters, rules, Signal, Signal Briefings
and bridges. That is a genuine bundle, but it is a narrower one than before, and
it is the bundle the price has to earn.

### Why a shorter trial

At $5/mo a 30-day trial cost a month's revenue and bought a considered purchase.
At $9/year it gives away a twelfth of the total price and keeps a dunning path
alive for it — and ADR 015 already flagged that yearly subscribers were getting
"30 days free, not 30 days into a $50 commitment". Fourteen days is enough to
import an OPML file and live with the reader through two weekly cycles.

### Why grace exists now and not before

`verify.ts` rejects the instant `expirySec` passes, and the client's 4xx branch
clears the token and drops the tier. Stripe retries a failed card over roughly
three weeks. On monthly billing that gap cost a customer a few days; on annual
it arrives after a year of goodwill and reads as the product breaking.

Grace is applied in `recordRenewal`, not in `verify.ts`, and not in `issue`:

- `issue` also covers trial start, where expiry is Stripe's `trial_end`. Grace
  there would quietly turn a 14-day trial into 21.
- Cancellation is enforced through the revocation deny-list, which `verify.ts`
  never consults. Putting grace on the renewal path means it forgives a retrying
  invoice **without** forgiving a cancellation. In `verify.ts` it would forgive
  both.

### Why `pro` survives on the wire

Licenses are signed tokens with up to a year of life, and they carry the tier in
the payload. Removing `"pro"` from `LicenseTier` would have made every
outstanding Pro token fail to decode, dropping those customers to Free on their
next page load — a self-inflicted outage for the users least deserving of one.
The wire is a compatibility surface; the matrix is a product surface. They are
now separate types with an explicit function between them.

The same reasoning applies to Stripe: `extractTier` still accepts a Price whose
`metadata.tier` says `pro`. Rejecting it would return `null`, which the webhook
answers with a 200 and no license at all — a paying customer silently receiving
nothing.

## Consequences

**Positive**

- One price, one card, one deeplink target, one env var.
- The price lives in `src/core/features/pricing.ts` and is test-pinned. It was
  previously eight unpinned literals across three components, which is how a
  `$19/month` Pro price outlived every other surface saying "Coming 2026".
- Two latent annual-billing defects are fixed: the 31-day issuer fallback and
  the zero-width renewal window.
- `next-steps.md` §5 (Pro roadmap) and §6 (annual emphasis) are answered.

**Negative**

- Revenue per subscriber drops sharply, as above.
- No monthly option. Customers who prefer small recurring charges have no path
  short of self-hosting.
- The paid tier's headline benefit is weaker with a 100-feed free cap.
- Two live Stripe prices during the migration window, until the last monthly
  subscription renews.
- `?subscribe=personal-monthly` is now a lie by name — it resolves to the annual
  price. Keeping it parseable is deliberate (old links must still sell), but the
  key name will read as wrong to the next person until the landing page and the
  runbook are updated and the key can be dropped.

## Alternatives considered

**Reprice Personal, keep Pro.** Rejected: it preserves the tier that has nothing
to sell, and forces a second number to be invented for it.

**Grandfather existing subscribers at $5/mo indefinitely.** Rejected: two live
price points to support forever, and a matrix that has to describe both. The
migration cost is a one-time revenue drop; the support cost of two prices is
permanent.

**Migrate immediately with proration.** Rejected: it issues real credits and
charges to real customers to save a few months of waiting.

**Keep a monthly option at ~$1/mo.** Rejected: Stripe's fixed per-transaction
fee is a large fraction of a $1 charge, so it is close to revenue-negative, and
it re-introduces the period toggle the pricing cards just lost.

**A lifetime SKU.** Not rejected — deferred. `002` and the 2026-05-16 run log
both recommend one for the subscription-fatigued (BazQux's $249 is repeatedly
cited). At $9/yr a $99 lifetime is eleven years of revenue pulled forward, which
makes the question sharper than it was, not softer. It needs its own ADR.

## Stripe migration checklist

The step-by-step order of operations lives in
[`docs/operations/annual-plan-migration.md`](../operations/annual-plan-migration.md).
The shape of it:

1. Create the `$9/yr` Price on the **existing** product, with
   `metadata.tier = personal`. A Price without that metadata makes `extractTier`
   return `null`, and the webhook answers a paying customer with a 200 and no
   license.
2. Add the new id to `STRIPE_ALLOWED_PRICES` *before* anything points at it —
   `resolveAllowedPrices` fails closed.
3. Set `VITE_PRICE_PERSONAL_YEARLY`; remove `VITE_PRICE_PERSONAL_MONTHLY`.
4. Ship the landing page, then the app (the serialization rule in `CLAUDE.md`).
5. Migrate the existing book with `scripts/migrate-to-annual-plan.ts` — dry-run
   by default, `--apply` to execute, idempotent across re-runs.
6. Once the last monthly subscription has renewed: archive the legacy price,
   drop it from the allowlist, and retire the `personal-monthly` deeplink key.

Decision item 7 is implemented as one Subscription Schedule per subscription:
phase 0 re-states the current billing period untouched, phase 1 is the annual
price with `proration_behavior: "none"` and no duration. Stripe gives that
phase one billing period and then ends the schedule; `end_behavior: "release"`
hands the subscription back still on the annual price, so the steady state is
$9/year with no schedule attached. Nobody is charged, credited or prorated at
the switchover.

The one Stripe behaviour that will bite a hand-edited migration: **an update
replaces a phase rather than merging into it**, so any attribute omitted from
the update is unset. A phase re-stated without its discounts loses them
silently. `buildAnnualScheduleUpdate` echoes the current phase wholesale for
that reason.

## Verification

- `npm run docs:tier-matrix -- --check` — the generated matrix doc tracks the
  module.
- `tests/core/features/pricing.test.ts` pins the amount, period and trial days.
- `tests/core/features/normalize-tier.test.ts` round-trips a real pre-repricing
  `pro` token through the codec and asserts it grants paid access.
- `tests/core/license/issuer.test.ts` covers the annual fallback, grace on
  renewal, and the trial explicitly *not* receiving grace.
- `tests/core/stripe/plan-migration.test.ts` pins the migration's eligibility
  rules and the schedule payload — including that the current phase is echoed
  back intact — including nulls nested inside `discounts` and `items`, which a
  verbatim echo trips over — and that the switchover prorates nothing. The flow
  was rehearsed end-to-end against a real Stripe test-mode subscription
  carrying a coupon and metadata before being run on the live book.
- Stripe test mode: `4242 4242 4242 4242` through `?subscribe=personal-yearly`,
  then `?subscribe=personal-monthly` to confirm the legacy key resolves rather
  than failing closed.
