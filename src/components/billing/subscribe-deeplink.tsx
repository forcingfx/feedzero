/**
 * Subscribe deeplink consumer.
 *
 * When the URL contains `?subscribe=<priceKey>` and the paid-tier flag is
 * on, this component fires a Stripe Checkout Session for the matching price
 * and redirects the customer to the hosted Checkout page.
 *
 * The link source is the landing page's pricing CTA — `feedzero-landing/
 * pricing/index.html` links to `https://my.feedzero.app/?subscribe=
 * personal-monthly`. The deeplink consumer keeps the app's own routing
 * untouched (no /buy URL hack, no special routes) and works alongside any
 * page the customer lands on.
 *
 * Mounted inside <AppInit>, after the database is ready. This is important
 * because a deeplinked new user goes through silent onboarding first —
 * firing checkout before isDbReady would interrupt that flow.
 *
 * Fires once per browser session via sessionStorage. Without this guard, a
 * customer who closes the Stripe tab and navigates back to the app's tab
 * would re-trigger checkout immediately on every re-render.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import {
  parseSubscribeIntent,
  resolvePriceId,
  type PriceIdMap,
} from "@/core/billing/deeplink";

const SESSION_FIRED_KEY = "feedzero:subscribe-deeplink-fired";

export interface SubscribeDeeplinkProps {
  paidTierVisible: boolean;
  priceIds: PriceIdMap;
}

export function SubscribeDeeplink({
  paidTierVisible,
  priceIds,
}: SubscribeDeeplinkProps) {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!paidTierVisible) return;
    if (sessionStorage.getItem(SESSION_FIRED_KEY) === "1") return;

    const intent = parseSubscribeIntent(searchParams);
    if (!intent) return;

    const priceId = resolvePriceId(intent.priceKey, priceIds);
    if (!priceId) return;

    fired.current = true;
    sessionStorage.setItem(SESSION_FIRED_KEY, "1");

    void fireCheckout(priceId);
  }, [searchParams, paidTierVisible, priceIds]);

  return null;
}

async function fireCheckout(priceId: string): Promise<void> {
  const origin = window.location.origin;
  try {
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceId,
        successUrl: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/billing/cancelled`,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      // Clear the session guard so the user can retry. We don't surface an
      // error UI here — the deeplink consumer is invisible by design; if it
      // fails, the user falls back to a manual Subscribe button.
      sessionStorage.removeItem(SESSION_FIRED_KEY);
      return;
    }
    window.location.href = body.url;
  } catch {
    sessionStorage.removeItem(SESSION_FIRED_KEY);
  }
}
