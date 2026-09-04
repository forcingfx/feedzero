# Feature 014: 30-Day Free Trial via Stripe Checkout

## Status
Implemented

## Summary

Every new subscriber opens with a 14-day free trial. Stripe owns the clock, FeedZero issues a license pinned to the trial end date, and the existing `invoice.paid → recordRenewal` path extends the license when the first charge lands on day 15. No new tier, no client-side trial state, no new endpoint — the trial is invisible to the app's data model. See [ADR 015](../decisions/015-stripe-side-trial.md) for the rationale and [ADR 029](../decisions/029-single-annual-plan-at-9-usd.md) for why the term shortened from 30 days to 14.

## Behaviour

```gherkin
Feature: 14-day free trial

  Scenario: New subscriber opens a Personal monthly Checkout Session
    Given a user lands on /?subscribe=personal-yearly
    When the deeplink fires /api/checkout/create-session
    Then the Stripe Checkout Session is created with subscription_data.trial_period_days=30
    And the customer enters a card but is not charged
    And consent_collection.terms_of_service="required" still gates the EU 14-day-waiver

  Scenario: Stripe fires customer.subscription.created on a trialing subscription
    Given the webhook handler receives a signed event with status="trialing"
    And the subscription carries current_period_end = trial_end_sec
    When handleSubscriptionCreated dispatches to issuer.issue
    Then issuer.issue is called with expirySec=trial_end_sec
    And a license token is minted that expires at the trial end (not at issuer default of 31 days)

  Scenario: Trial ends, first invoice paid
    Given day 30 passes and Stripe charges the stored card
    When the webhook receives invoice.paid with period.end = next_billing_sec
    Then issuer.recordRenewal extends the existing license to next_billing_sec
    And the customer experiences no functional change

  Scenario: Customer cancels during trial
    Given a trialing subscription
    When the customer cancels via Stripe Customer Portal
    And Stripe fires customer.subscription.deleted
    Then issuer.revoke marks every license for that customer as revoked
    And subsequent /api/sync requests with the old token return 401
```

## Architecture

### Flow

1. Customer clicks "Start 14-day free trial" on `/settings/subscription` (or lands on `?subscribe=personal-yearly` from the landing page).
2. `subscribe-deeplink.tsx` POSTs to `/api/checkout/create-session` with `{priceId, successUrl, cancelUrl}` — body unchanged from the pre-trial flow.
3. `handleCreateCheckoutSession` (`src/core/stripe/checkout-handler.ts`) injects `subscription_data: { trial_period_days: 30 }` server-side and calls Stripe.
4. Customer completes Checkout on Stripe's hosted page; card stored, no immediate charge.
5. Stripe fires `customer.subscription.created` with `status: "trialing"` and `current_period_end` = trial end.
6. `handleSubscriptionCreated` (`src/core/stripe/webhook-handler.ts`) calls `extractSubscriptionCurrentPeriodEnd(obj)` and passes the result as `expirySec` to `issuer.issue`. License is minted with that exact expiry.
7. License token is delivered to the customer via the success-page handoff (`pages/billing-success.tsx` reads the Stripe session and fetches the matching license).
8. On day 31 Stripe charges the card and fires `invoice.paid`. `handleInvoicePaid → issuer.recordRenewal` updates the same license record's `expirySec` to `period.end` (≈ day 61).

### Files

| File | Role |
|------|------|
| `src/core/stripe/checkout-handler.ts` | Injects `subscription_data.trial_period_days` into every Checkout Session create call. Houses `TRIAL_PERIOD_DAYS = 30` constant — the single source of truth. |
| `src/core/stripe/webhook-handler.ts` | `handleSubscriptionCreated` now reads `current_period_end` and passes it as `expirySec` to `issuer.issue`. Falls back to issuer default if missing (back-compat / non-trial subscriptions). |
| `src/core/license/issuer.ts` | Unchanged — `mintAndPersist` already honored `expirySec` overrides. Only the public `LicenseIssuer.issue` interface was widened. |
| `src/components/settings/subscription-upgrade.tsx` | Supporter card surfaces the trial length in blurb and CTA, both read from `PAID_PLAN`. |
| `src/core/stripe/test-fixtures.ts` | `subscriptionCreatedEvent` accepts optional `current_period_end`; new `subscriptionCreatedEventDahlia` mirrors the 2026-04-22 API-version shape. |

### Tests

| File | Coverage |
|------|----------|
| `tests/core/stripe/checkout-handler.test.ts` | Asserts `subscription_data: { trial_period_days: 30 }` is passed on every call; EU consent + idempotency key unchanged. |
| `tests/core/stripe/webhook-handler.test.ts` | Two new cases: trialing subscription.created with top-level `current_period_end`, and dahlia variant with `current_period_end` on items[0]. |
| `tests/core/license/issuer.test.ts` | New case: `issue({expirySec: T})` persists a record whose `expirySec === T`. |
| `tests/components/settings/subscription-upgrade.test.tsx` | Asserts the trial CTA + trial-length copy render, derived from `PAID_PLAN`. |
| `tests/smoke/checkout.test.ts` | Pre-existing — endpoint reachable, allowlist enforced. Does NOT exercise the trial-create path (would create real Stripe data); manual verification covers it. |

## Design Decisions

- **Trial duration is a code constant, not an env var or Dashboard setting.** Monetary terms must live in git. See ADR 015.
- **Pin license expiry to `current_period_end`, not to the issuer's default.** The issuer default is now a full year (billing is annual), so a trialing customer who fell through to it would receive a year of paid access for free. Reading the subscription's own clock is both more correct and, since ADR 029, load-bearing.
- **No new `LicenseTier`.** Trialing customers carry `tier=personal`. Feature gates need zero changes; the trial is invisible to `feature-gates.ts`.
- **No app-side trial state.** `localStorage` and stores don't know about trials. The Stripe-side `current_period_end` is the only source of truth.
- **Every subscriber gets the same trial.** Billing is annual-only since ADR 029, so there is one term and one trial; the monthly/yearly asymmetry ADR 015 accepted no longer exists.

## Manual verification

Unit tests prove the handler emits `subscription_data.trial_period_days`. They cannot prove Stripe's hosted page actually shows the trial banner — that's a Stripe-rendered surface. Once per deploy:

1. On staging (`SMOKE_BASE_URL=https://staging.feedzero.app`), POST a valid `personal-yearly` checkout body and copy the returned `body.url`.
2. Open the URL in a browser. Expect:
   - "Try free for 14 days" or equivalent trial banner beneath the price line.
   - The EU Terms-of-Service consent checkbox still present.
   - No immediate charge to the test card (use `4242 4242 4242 4242`).
3. Advance Stripe's test clock to 31 days. Expect `invoice.paid` fires and `recordRenewal` extends the license.

## Limitations

- **Abuse vector**: a determined user can claim a trial twice via different emails or email aliases (`user+1@gmail.com`). Stripe does not natively block this. Out of scope; revisit if smoke metrics show real abuse.
- **No "X days left" UI in the app.** License payload doesn't carry a trialing-vs-active flag. Surfacing it would require either a payload-format change or an extra `/api/license/status` call. Future work if customer confusion becomes a support driver.
- **Legacy `?subscribe=personal-monthly` links** still resolve, but to the annual price — the key name no longer describes what it does. It stays parseable so links already in the wild keep selling; drop it once the landing page and the support runbook stop emitting it.
