# Runbook — migrating to the single $9/year plan

Operational companion to [ADR 029](../decisions/029-single-annual-plan-at-9-usd.md).
The ADR decides *what* and *why*; this file is the order of operations.

**Audience**: whoever holds the Stripe live keys. **Blast radius**: every paying
customer's next invoice. Read the whole file before running anything.

---

## The shape of the change

Existing subscribers are on `$5/mo` or `$50/yr`. They move to `$9/yr` **at
their next renewal** — no proration, no mid-period charge, no credit. The
mechanism is one Stripe Subscription Schedule per subscription:

| Phase | Price | When |
| --- | --- | --- |
| 0 | whatever they pay now | until the current period ends (unchanged) |
| 1 | `$9/yr` | from then on, open-ended |

Nobody is charged at the switchover. The first `$9` invoice is the one that
would have been their next `$5` or `$50` invoice.

Two prices stay live for the duration: the legacy monthly one cannot be
archived until the last monthly subscription has renewed onto annual.

---

## Order of operations

The steps are ordered so that **every reversible step happens before the first
irreversible one**, and so no customer can reach a checkout page that prices
something the app does not sell.

### 1. Create the annual price in Stripe (live mode)

Product: the existing paid product. Do **not** create a new product — the
license webhook reads `metadata.tier` off the Price, and a new product would
orphan the existing subscriptions' reporting.

- Amount `$9.00`, currency `usd`, recurring, interval `year`.
- **`metadata.tier = personal`** — this is load-bearing. `extractTier` in
  `webhook-handler.ts` reads it; a Price without it returns `null`, which the
  webhook answers with a 200 and no license. The customer pays and receives
  nothing.

Record the resulting `price_...` id.

### 2. Add the new price to the allowlist, before anything points at it

```
STRIPE_ALLOWED_PRICES=<existing ids>,<new annual id>
```

`resolveAllowedPrices` fails closed — a price missing from this list is
rejected at checkout with a 400. Adding it first means step 3 cannot produce a
window where the deploy is live and checkout is broken.

Keep the legacy monthly id in the list until step 7. Old links and in-flight
sessions still resolve through it.

### 3. Point the build at the new price

Vercel build env:

```
VITE_PRICE_PERSONAL_YEARLY=<new annual id>
```

`VITE_PRICE_PERSONAL_MONTHLY` is **removed** — it no longer has a consumer.
The retired `?subscribe=personal-monthly` deeplink key now resolves to the
annual price, so old links keep selling rather than failing closed.

### 4. Ship the landing page first

Per the landing/feedzero serialization rule in `CLAUDE.md`,
`feedzero-landing/pricing/index.html` ships **before** the app. It is the
surface strangers see; a landing page advertising `$5/mo` next to an app that
charges `$9/yr` is the one inconsistency a prospective customer will actually
notice.

### 5. Ship the app

Deploy the ADR 029 branch. At this point new customers buy the annual plan.
Existing subscribers are untouched and still on their old price — that is
correct, and step 6 is what changes it.

### 6. Migrate the existing book

```bash
vercel env pull .env.production --environment=production

# Dry run — the default. Changes nothing, prints the full plan.
npx tsx scripts/migrate-to-annual-plan.ts

# Rehearse on one real subscription and verify it in the Dashboard
npx tsx scripts/migrate-to-annual-plan.ts --subscription sub_1P... --apply

# Then the rest
npx tsx scripts/migrate-to-annual-plan.ts --apply

rm .env.production   # contains live Stripe keys in cleartext
```

Read the dry run before applying. It prints one line per subscription and a
reason for every skip:

| Skip reason | Meaning |
| --- | --- |
| `already-annual` | on the target price already — a completed migration, or a new customer |
| `already-scheduled` | a schedule exists; migrated by an earlier run, or manually scheduled |
| `cancelling` | `cancel_at_period_end` is set. Leave them alone; they are leaving |
| `inactive-status` | canceled / unpaid / incomplete_expired — no next renewal to reprice |
| `multiple-items` | more than one line item. Handle by hand rather than guessing which to reprice |

The script is **idempotent**. A migrated subscription is skipped as
`already-scheduled` on the next run, so re-running after a partial failure
resumes rather than double-applying. A per-subscription failure does not abort
the run; failures print to stderr and the exit code is non-zero.

`past_due` subscribers **are** migrated. Stripe retries a failed card for about
three weeks and those customers are still customers — the same reasoning that
put a 7-day grace window on renewal in the first place.

### 7. After the last monthly subscription renews

Only now:

- Archive the legacy monthly price in Stripe.
- Remove its id from `STRIPE_ALLOWED_PRICES`.
- Drop the `personal-monthly` key from `src/core/billing/deeplink.ts` and the
  landing page's links. ADR 029 flags this key as "a lie by name" — it is kept
  only so old links keep working, and this is the step that retires it.

Check for stragglers with the dry run: when it reports zero to migrate and no
`already-scheduled` skips, every schedule has completed its first phase.

---

## Verifying a single migration

In the Dashboard, on a migrated subscription:

- A schedule is attached, with **two** phases.
- Phase 1 ends at the subscription's existing `current_period_end` — *not*
  sooner. If it moved, the switchover will bill early.
- Phase 2 is the `$9` annual price, with no end date.
- **Upcoming invoice is unchanged in amount and date.** This is the check that
  matters: if it moved, proration leaked in.
- Any coupon, tax rate or metadata the customer had is still on phase 1.

That last one is the failure mode worth naming. Stripe **unsets any phase
attribute omitted from an update** — it replaces the phase, it does not merge
into it. `buildAnnualScheduleUpdate` echoes the current phase wholesale for
exactly this reason, and
`tests/core/stripe/plan-migration.test.ts` pins it. If you ever hand-edit a
schedule update, re-state every field you want to keep.

---

## Rolling back

**Before step 6**: revert the deploy and put `VITE_PRICE_PERSONAL_MONTHLY`
back. Nothing customer-visible has changed.

**After step 6, per subscription**: release the schedule
(`subscriptionSchedules.release`). The subscription keeps its current price
and detaches from the schedule; the phase-2 change never happens. Nobody was
charged, so there is nothing to refund.

**After a customer has renewed onto `$9`**: there is no rollback. They are an
annual subscriber now. This is the point of no return, and it arrives one
customer at a time as each period ends — which is the reason step 6 has a
rehearsal step and a dry run.

---

## What this runbook deliberately does not do

- **No proration, ever.** Stripe would happily credit unused time and charge
  the difference. ADR 029 rejected that: it issues real charges to real
  customers to save a few months of waiting.
- **No bulk Dashboard edit.** The Dashboard cannot express "keep phase 1
  exactly as it is" across a book of subscriptions; each hand-edit is a chance
  to drop someone's coupon.
- **No customer email from the script.** Notifying subscribers of a price
  *decrease* is a product decision, not an operational one, and the script
  prints subscription ids only — it never reads or logs an email address.
