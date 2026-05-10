/**
 * Stripe Checkout success redirect target.
 *
 * Stripe sends customers here after a completed Checkout. The `session_id`
 * query param is set by Stripe when our `success_url` includes the
 * `{CHECKOUT_SESSION_ID}` template — see SubscribeButton's URL construction.
 *
 * UX contract:
 *  - Confirmation heading so the customer knows the payment landed.
 *  - LicenseTokenInput inline so they can paste their token without
 *    navigating elsewhere. Once email delivery is wired, the email will
 *    contain a deep-link OR the token will arrive in a webhook-driven
 *    cookie/localStorage push — until then, manual paste is the path.
 *  - Stripe session ID echoed in plain text for support debugging.
 *  - A clear way back to the reader.
 *
 * The page renders unconditionally — there's no point gating it behind
 * VITE_PAID_TIER_VISIBLE because users only land here AFTER going through
 * the Subscribe → Checkout flow, which itself is gated. If they navigate
 * here directly with no context, we still render it (the content is
 * harmless) so a copy-pasted email link works regardless of build flag.
 */

import { useSearchParams } from "react-router";
import { LicenseTokenInput } from "@/components/billing/license-token-input";

export function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">
        Thanks for subscribing to FeedZero
      </h1>

      <p>
        Your payment has been processed. Check your email for your license
        token, then paste it below to activate sync on this device.
      </p>

      {/*
       * Always pass paidTierVisible=true here. The component itself is
       * imported from PR Y where it's gated for the homepage; on the
       * post-purchase page there's no reason to hide the input.
       */}
      <LicenseTokenInput paidTierVisible={true} />

      {sessionId && (
        <p className="text-sm text-muted-foreground">
          Stripe session: <code>{sessionId}</code>
        </p>
      )}

      <p>
        <a href="/feeds">Back to FeedZero</a>
      </p>
    </div>
  );
}
