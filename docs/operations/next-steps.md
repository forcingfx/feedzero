# Next steps — actions only you can take

This file lists the things I (the agent) cannot do — credential rotations, Dashboard configuration, business decisions — and which I deliberately left for you after shipping the unified Settings + license robustness work.

Ordered by impact-per-minute. Knock out items 1–4 in the next ~30 minutes; items 5+ are queue.

---

## 1. Stripe Dashboard — enable customer receipt emails (5 min, $0)

**Why now**: Customers don't currently receive a Stripe-side receipt for "successful payments." The license-token delivery path is already wired (success page → `/billing/recover` → magic-link) but Stripe's transactional receipt is OFF by default. Turning it on means every paying customer has a record of payment in their inbox archive — the safety net under the safety net.

**Action**:
1. Open <https://dashboard.stripe.com/settings/emails>
2. Enable **"Successful payments"** under "Customer emails"
3. Optionally enable **"Refunds"** and **"Subscription renewals"** — friendly transparency, helps reduce chargebacks

No code change required. Test by completing a fresh purchase with a test card in test mode; check the customer's email inbox.

---

## 2. Stripe Dashboard — verify `support@feedzero.app` is the customer-facing support address (5 min, $0)

**Why now**: The new in-product "Contact support" and `/billing/recover` "didn't get an email?" CTAs route customers to `mailto:support@feedzero.app`. If that mailbox isn't monitored, customers send into a void.

**Action**:
1. Confirm `support@feedzero.app` exists and routes somewhere you check daily (Proton, Gmail forwarding, etc.)
2. Set an away message during weekends if turnaround varies — managed expectations beat surprise silence
3. (Optional) Add `support@feedzero.app` as a billing contact on the Stripe account so Stripe's payout / risk emails reach the same address

If the address isn't real, replace the constant `SUPPORT_EMAIL` in two places:
- `src/components/settings/account-safety-controls.tsx`
- `src/pages/billing-recover.tsx`

---

## 3. Stripe Dashboard — Customer Portal config (10 min, $0)

**Why now**: The whole cross-device recovery flow leans on the Stripe Customer Portal. We open it programmatically; Stripe shows whatever your portal is configured to show. A few toggles matter:

**Action** (<https://dashboard.stripe.com/settings/billing/portal>):
1. **Login link emails** — ON. This is how Stripe sends the magic link customers use to authenticate to the portal.
2. **Allow customers to cancel subscriptions** — ON. Required for in-product cancel-from-portal flow. Otherwise customers email you to cancel and you handle it manually.
3. **Allow customers to update payment methods** — ON.
4. **Allow customers to switch plans** — defer until Pro launches; switching between Personal monthly and yearly is fine to enable now.
5. **Return URL** — leave as default; we override per-session with the signed recovery token URL.
6. (Optional) Customize the portal branding to match FeedZero — logo, color, footer link to feedzero.app.

---

## 4. Verify the `/billing/recover` deep flow end-to-end (15 min)

The recovery flow has 5 server boundaries (recover handler → Stripe customers.list → Stripe portal create → Stripe email magic-link → portal return → issue-from-recovery handler → license-store). Each is unit-tested but the *integration* depends on Stripe Dashboard config (#1 + #3 above) being correct in production.

**Action**:
1. With a real subscriber on the live site (you, with a test purchase or your existing subscription), open `https://my.feedzero.app/billing/recover` in an incognito window.
2. Enter your subscriber email. Submit.
3. Confirm you receive a Stripe email within 60s. If not, #3 isn't configured correctly.
4. Click the magic link. Confirm you land in the Stripe Customer Portal authenticated.
5. Click "Return to FeedZero" (or close the portal — Stripe redirects to the return URL).
6. Confirm you land at `/billing/issued`, see "Welcome back to Personal", and your license activates (Settings → Account → tier shows "Personal").

If anything breaks here, that's the customer experience. We don't have a smoke test that exercises this against live Stripe yet (would need test-mode billing portal config); manual verification is the only honest signal.

---

## 5. Pro tier roadmap — CLOSED (2026-09-04)

Answered by [ADR 029](../decisions/029-single-annual-plan-at-9-usd.md): **Pro is
retired, not priced.** Every Pro-only feature was coming-soon, so the tier asked
customers to fund a promise. Its four features moved onto the single paid tier
with `status` unchanged, so nothing unlocked for anyone. The `$19/mo`
placeholder is gone.

Shipping one of those features is now just flipping its `status` to `"shipped"`
in `src/core/features/tier-matrix.ts` — no new Stripe price, no new env var, no
new tier.

The **founder lifetime offer** question stays open and is now sharper, not
softer: at $9/year a $99 lifetime is eleven years of revenue pulled forward.
`docs/strategy/002-user-pain-points.md` recommends one; it needs its own ADR.

---

## 6. Annual emphasis — CLOSED (2026-09-04)

Answered by [ADR 029](../decisions/029-single-annual-plan-at-9-usd.md): billing
is **annual-only** at $9/year, so there is no monthly CTA to be a secondary link
beneath. Nothing to A/B test.

The landing page (`feedzero-landing/pricing/index.html`) still needs updating to
match. It ships as step 4 of
[`docs/operations/annual-plan-migration.md`](annual-plan-migration.md), the
runbook for the whole cutover.

---

## 7. Replace placeholder masked-token width (cosmetic)

`MASKED_TOKEN` in `src/components/settings/account-tab.tsx` is a fixed-length 26-char-dotted string. Real tokens vary in length. Cosmetic; the reveal/hide UX is otherwise fine. Defer until/unless visual jitter on reveal is reported.

---

## 8. Cosmetic Phase B leftovers (deferred)

The original Phase B plan also called for:
- Replace the sidebar `<SettingsMenu>` dropdown with a single Settings button. Requires folding Auto-organize, Feedback, Keyboard shortcuts, and Group floods into Reading + Help tabs first (each is a small refactor of an existing dialog into inline section content). Not user-blocking — the dropdown's items are all still reachable; the canonical settings surface is the unified dialog you reach via the dropdown's "Account" entry or the sidebar chip click.
- Delete dormant store fields (`useSyncStore.dialogOpen`, `useLicenseStore.upgradeDialogOpen`) and their setters. Harmless dormant state; deletion is purely cosmetic.

Pick these up when the rest of the launch posture is stable and you want a clean tree.

---

## 9. Operational alerting (PR 3 from earlier plan)

Still queued, still valuable:
- Slack/Discord webhook on `acceptedWithIssue` paths in webhook-handler. Catches silent-200 webhook failures (e.g., missing tier metadata on a new price) before customers complain.
- Vercel monitor for `/api/license/retrieve` 5xx rate.
- End-to-end smoke test in `tests/smoke/billing-end-to-end.test.ts` that exercises checkout → mocked Stripe → webhook → retrieve and asserts a token shape.

Pulls together everything we've built. Worth a focused 1–2 hour session when you have the energy.
