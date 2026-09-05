# Runbook — migrating to the single $9/year plan

Operational companion to [ADR 029](../decisions/029-single-annual-plan-at-9-usd.md).
The ADR decides *what* and *why*; this file is the order of operations.

**Audience**: whoever holds the Stripe live keys. **Blast radius**: every paying
customer's next invoice. Read the whole file before running anything.

---

## The shape of the change

Existing subscribers are on `$5/mo`. They move to `$9/yr` **at
their next renewal** — no proration, no mid-period charge, no credit. The
mechanism is one Stripe Subscription Schedule per subscription:

| Phase | Price | When |
| --- | --- | --- |
| 0 | whatever they pay now | until the current period ends (unchanged) |
| 1 | `$9/yr` | one year, then the schedule releases and the sub keeps renewing at $9/yr |

Nobody is charged at the switchover. The first `$9` invoice is the one that
would have been their next `$5` invoice.

The legacy $5/month price stays live for the duration — it cannot be archived
until the last subscription on it has renewed onto annual. The $50/year price
has no subscribers at all and can go as soon as nothing points at it.

---

## Order of operations

The steps are ordered so that **every reversible step happens before the first
irreversible one**, and so no customer can reach a checkout page that prices
something the app does not sell.

### 0. The live account, as of 2026-09-05

| Object | id | Note |
| --- | --- | --- |
| Product — paid tier | `prod_UUUyM2HGjTzviA` | renamed to *FeedZero Supporter* ✅ 2026-09-05 |
| Price — $9/year | `price_1UCKSrRvqrfm74B2ZVK37lv2` | created ✅ 2026-09-05, `metadata.tier=personal` |
| Product — Pro | `prod_UUV0RkTZnBloZC` | retired by ADR 029; archive |
| Price — $5/month | `price_1TVVy6Rvqrfm74B2DZ2Qa9NE` | **3 live subscriptions**; keep until they renew |
| Price — $50/year | `price_1TVW0nRvqrfm74B2BtFlcf6D` | **zero subscriptions**; archivable immediately |
| Price — $19/month Pro | `price_1TVW0DRvqrfm74B2L2dItBhZ` | never sold; not in the allowlist |
| Price — $199/year Pro | `price_1TVW0DRvqrfm74B2rNLLRprR` | never sold; not in the allowlist |

The whole book is **three subscriptions** — two `active`, one `trialing`, all
on the $5/month price. Nine exist in total; six are already `canceled`. No
subscription was ever created on a Pro price, so the `pro` compatibility
surface in ADR 029 (`normalizeTier`, `extractTier` accepting `"pro"`) protects
an empty population. Keep it — it costs nothing and the wire is a
compatibility surface — but do not treat it as load-bearing.

### 1. Create the annual price, and fix the product copy — ✅ done 2026-09-05

The Stripe **product name and description print on invoices, receipts and the
customer portal**. They are a second copy of the tier label living outside the
codebase, which no test can pin — the same failure mode as the `$19/month` Pro
price that outlived every other surface. Rename with the price change, or the
app will say Supporter while the receipt says Personal:

```bash
stripe products update prod_UUUyM2HGjTzviA --live \
  --name "FeedZero Supporter" \
  --description "Auto-organize, offline prefetch, smart filters, rules, Signal, bridges"
```

The old description — *"Hosted sync, bridges, daily digest, light AI"* — also
advertised hosted sync, which became **free** in v0.11.0.

Then the price, on that same product. Do **not** create a new product: the
webhook reads `metadata.tier` off the Price, and a new product orphans the
existing subscriptions' reporting.

```bash
stripe prices create --live \
  --product prod_UUUyM2HGjTzviA \
  --unit-amount 900 \
  --currency usd \
  -d "recurring[interval]=year" \
  -d "metadata[tier]=personal"
```

- **`metadata.tier = personal`** is load-bearing. `extractTier` in
  `webhook-handler.ts` reads it; a Price without it returns `null`, and
  `handleSubscriptionCreated` answers the webhook with a **200** and issues no
  license. The customer is charged and receives nothing, with no Stripe retry
  to save you.
- **Do not put a trial on the Price.** The 14 days come from the Checkout
  Session (`checkout-handler.ts`, `subscription_data.trial_period_days` ←
  `PAID_PLAN.trialDays`). A trial on the Price as well would stack.

Verify before moving on:

```bash
stripe prices retrieve --live price_1UCKSrRvqrfm74B2ZVK37lv2
```

Both were run on 2026-09-05. The resulting price is
`price_1UCKSrRvqrfm74B2ZVK37lv2` — `$9.00/year`, `metadata.tier=personal`,
`trial_period_days: null`.

### 2. Add the new price to the allowlist, before anything points at it

```
STRIPE_ALLOWED_PRICES=price_1TVVy6Rvqrfm74B2DZ2Qa9NE,price_1UCKSrRvqrfm74B2ZVK37lv2
```

Keep the $5/month id — three subscribers still renew on it until step 6
completes. **Drop `price_1TVW0nRvqrfm74B2BtFlcf6D`** (the $50/year): it has no
subscribers and nothing will point at it again.

Set it on **Preview as well as Production**, or preview deploys break.

`resolveAllowedPrices` fails closed — a price missing from this list is
rejected at checkout with a 400. Adding it first means step 3 cannot produce a
window where the deploy is live and checkout is broken.

### 3. Point the build at the new price

Vercel build env:

```
VITE_PRICE_PERSONAL_YEARLY=<new annual id>
```

`VITE_PRICE_PERSONAL_MONTHLY` is **removed** — nothing reads it after ADR 029;
`app.tsx` passes only `personalYearly`.
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

The dry run on 2026-09-05, against the whole live book:

```
9 subscription(s) examined against price_1UCKSrRvqrfm74B2ZVK37lv2
3 to migrate, 6 skipped

  skip           <6 ids>                       (inactive-status)
  would migrate  sub_1U3hA6Rvqrfm74B26iV9dfrN  status=trialing  first $9 invoice ≈ 2026-09-11
  would migrate  sub_1TuHCpRvqrfm74B21mBOZMsa  status=active    first $9 invoice ≈ 2026-09-16
  would migrate  sub_1TlLkeRvqrfm74B29TPzpacJ  status=active    first $9 invoice ≈ 2026-09-23
```

**There is a clock on this.** Each subscription only moves at its *next*
renewal, so one that bills before the schedule is attached renews at $5/month
and waits another month. The earliest is 2026-09-11.

`past_due` subscribers **are** migrated. Stripe retries a failed card for about
three weeks and those customers are still customers — the same reasoning that
put a 7-day grace window on renewal in the first place.

### 7. After the last monthly subscription renews

The $50/year price (`price_1TVW0nRvqrfm74B2BtFlcf6D`) has no subscribers and
can be archived at step 3, as soon as `VITE_PRICE_PERSONAL_YEARLY` no longer
points at it. Only the $5/month price has to wait for this step.

Optional and independent of the schedule: archive the two Pro prices and
`prod_UUV0RkTZnBloZC`. They are unreachable through checkout today because the
allowlist excludes them, but they stay selectable in the Dashboard for a manual
invoice or Payment Link, and ADR 029 retires the tier. Archiving is reversible.

Only after the last monthly renewal:

- Archive `price_1TVVy6Rvqrfm74B2DZ2Qa9NE` (the $5/month).
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
- Phase 2 is the `$9` annual price. It carries an end date one year out — that
  is expected. With `end_behavior: release` the schedule then hands the
  subscription back *still on the annual price*, and it renews normally with no
  schedule attached.
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
