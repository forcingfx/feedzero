# License support runbook

The procedure operators follow when a customer can't recover their FeedZero license through `/billing/recover`.

## When this happens

The self-serve flow at `/billing/recover` works for most users. They enter their email, click a Stripe magic-link, land in the Stripe Customer Portal, click "Return to FeedZero", and arrive at `/billing/issued` with a fresh license issued. The CLI documented below is the **fallback** for everything that goes wrong:

- Stripe magic-link email goes to spam and stays there.
- Customer used a different email at checkout than they remember.
- Customer clicked the magic link, signed in to Stripe, then closed the tab without clicking "Return to FeedZero" — the license was never issued.
- Customer needs a tier override (manual comp, complaint resolution).
- Stripe Customer Portal UI variant didn't show a visible return link.

In every case the procedure is the same: look up, then either paste the active token or reissue.

## Triage — which type of problem is this?

Read the support email and classify:

| Symptom in the customer's email | Procedure section |
|---|---|
| "I never got the Stripe email" | [Procedure 1 — lookup + reissue](#procedure-1--lookup--reissue) |
| "I signed in to Stripe but nothing happened" | [Procedure 1 — lookup + reissue](#procedure-1--lookup--reissue) |
| "The link says 'Recovery link missing/invalid'" | [Procedure 1 — lookup + reissue](#procedure-1--lookup--reissue) |
| "I don't remember which email I used" | [Procedure 2 — multiple lookups](#procedure-2--multiple-lookups) |
| "I cancelled but want my data back" | [Procedure 3 — cancelled subscription](#procedure-3--cancelled-subscription) |
| "I want a tier comp / refund-as-credit" | Out of scope for this runbook; reply manually after consulting Stripe |

## Procedure 1 — lookup + reissue

The default path. Works for 95% of license-recovery support emails.

### Setup (one-time per session)

```bash
# Pull the production env (contains LICENSE_SIGNING_KEY in cleartext)
vercel env pull .env.production --environment=production

# Verify required keys are present
grep -E "LICENSE_SIGNING_KEY|KV_REST_API_URL|KV_REST_API_TOKEN|STRIPE_SECRET_KEY" .env.production
```

### Step 1 — look up the customer

If the customer told you their email:

```bash
npx tsx scripts/find-license.ts --email customer@example.com
```

If you already have the Stripe customer id (from the Dashboard, or from a prior lookup):

```bash
npx tsx scripts/find-license.ts --customer cus_PqRsTuVwXyZ
```

Expected output for a paying customer:

```
Stripe customer: cus_PqRsTuVwXyZ (customer@example.com)
License records (newest first):
  keyId=lk_3f7a... tier=personal status=active   issued=2026-01-15 expires=2027-01-15
```

Expected output if there are no records (customer paid but no license was issued — rare; usually means a Stripe webhook fired before the storage was ready):

```
Stripe customer: cus_PqRsTuVwXyZ (customer@example.com)
License records: (none) — customer has no licenses in storage.
```

### Step 2 — decide

| What you see | What to do |
|---|---|
| Active record exists, recent expiry | Just reissue (Step 3). You don't need the original token's text — reissuing mints a brand-new token signed with the same key. |
| Active record exists, expiry far in the future, customer just needs the token text | Same: reissue. The CLI prints a fresh token. The old one remains valid until expiry but it's not exposed by the CLI. |
| No records, but Stripe shows an active subscription | The webhook likely failed. Reissue still works — the issuer mints from the customer + subscription state. |
| Stripe customer not found | Customer used a different email. Go to [Procedure 2](#procedure-2--multiple-lookups). |
| Subscription is cancelled in Stripe | Go to [Procedure 3](#procedure-3--cancelled-subscription). |

### Step 3 — reissue

```bash
npx tsx scripts/find-license.ts --customer cus_PqRsTuVwXyZ --reissue
```

The CLI prints both the lookup result AND the new token:

```
Stripe customer: cus_PqRsTuVwXyZ (customer@example.com)
License records (newest first):
  keyId=lk_3f7a... tier=personal status=active   issued=2026-01-15 expires=2027-01-15

Reissuing license at tier=personal…
New token:
  fz_eyJraWQiOi...XxYyZz
keyId=lk_9z8y... expires=2027-01-15
Paste this token into your reply to the customer's support email. Do not commit or chat-paste.
```

### Step 4 — reply to the customer

Paste the `fz_...` token into your support reply. Suggested template:

> Hi [name],
>
> I've issued a fresh license for your account. Open FeedZero on the device where you want to activate, click the "Already have a FeedZero account?" link, and paste this token:
>
> `fz_eyJraWQiOi...XxYyZz`
>
> Your existing license remains valid; this is an additional active token. Let me know if you run into any trouble.
>
> — FeedZero support

### Step 5 — clean up

```bash
# Delete the local env (contains LICENSE_SIGNING_KEY in cleartext)
rm .env.production
```

## Procedure 2 — multiple lookups

When the customer is unsure which email they used:

1. Ask them for every email they might have used (work, personal, alt).
2. Run `find-license.ts --email` for each one.
3. The one that resolves to a Stripe customer + active record is the right one.
4. If none of them match, the customer never paid (or paid through a third party — escalate manually).

## Procedure 3 — cancelled subscription

If Stripe shows the subscription as cancelled, do **not** reissue. A token issued against a cancelled subscription would still verify (the signing key doesn't know about Stripe state), but it would let a former subscriber continue to access paid features after their period ended.

Instead:

1. Confirm the cancellation in the Stripe Dashboard.
2. Reply to the customer explaining their access ended on `<period_end>`.
3. If they want to resubscribe, point them at `/?subscribe=personal-monthly`.
4. If they're disputing the cancellation (genuinely think they didn't cancel), check Stripe events for the customer — most cancellations are user-initiated; Stripe's audit trail says when and how.

## Security expectations

- **The signing key is the keys to the kingdom.** Anyone with `LICENSE_SIGNING_KEY` can mint tokens at any tier for any customer. Keep `.env.production` on operator machines only, delete after each session, never commit, never paste to chat or any web tool.
- **Reissued tokens print only to stdout.** The CLI is deliberately not logged. Don't redirect output to a file. Don't `tee` it. The one legitimate destination is the operator's reply email.
- **Reissue is auditable.** Every `--reissue` writes a fresh `LicenseRecord` to production storage. Future `find-license.ts` lookups will show the operator-issued record alongside the original — auditors can see exactly what was issued and when.
- **Revocation is out of scope for this CLI.** If a customer's license is leaked and needs revocation, that's a separate workflow (TODO: add `--revoke` flag once the use case arrives; the storage layer already supports it via `revoke(keyId, reason)`).

## Stripe Customer Portal configuration

In the Stripe Dashboard → Settings → Billing → Customer portal:

| Setting | Value |
|---|---|
| Business name | `FeedZero` |
| Headline (Business information) | `Click 'Return to FeedZero' above to finish activating your license` |
| Support email | `support@feedzero.app` |

These values determine what the user sees in the portal after they sign in via the magic-link email. The "Return to merchant" link reads "Return to FeedZero" when the business name is set, and that's the critical UX nudge that makes the self-serve flow complete.

A future PR will add outbound email infrastructure (Resend or equivalent) and bypass the portal stop entirely; until then, the portal-config values above keep the dead-end as survivable as possible.

## Related code

| Path | Purpose |
|---|---|
| `scripts/find-license.ts` | The operator CLI (I/O shell). |
| `src/core/license/admin-find-license.ts` | Pure library functions: lookup-by-email, lookup-by-customer, reissue. |
| `src/core/stripe/find-customer-by-email.ts` | Stripe customer lookup helper (shared with `recover-handler.ts`). |
| `src/core/license/issuer.ts` | `LicenseIssuerImpl` — does the mint-and-persist. |
| `src/core/license/storage.ts` | `LicenseStorage` contract — `listByCustomer`, `put`, `revoke`. |
| `src/pages/billing-recover.tsx` | Self-serve recovery entry page; explicit guidance to click "Return to FeedZero". |
| `src/pages/billing-issued.tsx` | Self-serve recovery completion page; falls back to support mailto on missing/invalid token. |
