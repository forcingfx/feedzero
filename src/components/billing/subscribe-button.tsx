/**
 * Subscribe button — initiates Stripe Checkout flow.
 *
 * The button only renders when `paidTierVisible=true`. The launch wiring
 * passes `paidTierVisible={import.meta.env.VITE_PAID_TIER_VISIBLE === "1"}`,
 * so the entire surface stays hidden until the operator flips that env var
 * at build time.
 *
 * On click:
 *   1. POSTs to /api/checkout/create-session with priceId + success/cancel
 *      URLs derived from window.location.origin
 *   2. On 200 + {url}: redirects window.location to the Stripe-hosted page
 *   3. On error: surfaces the error message inline (no toasts — pricing
 *      problems should be unmissable, not auto-dismissed)
 */

import { useState } from "react";

export interface SubscribeButtonProps {
  /** Stripe price ID to subscribe to. Must be in the server's STRIPE_ALLOWED_PRICES. */
  priceId: string;
  /**
   * Master visibility gate. Source: `import.meta.env.VITE_PAID_TIER_VISIBLE`.
   * Passed in (rather than read here) so tests don't have to mock import.meta.
   */
  paidTierVisible: boolean;
  /** Optional label override. Defaults to "Subscribe". */
  label?: string;
}

export function SubscribeButton({
  priceId,
  paidTierVisible,
  label = "Subscribe",
}: SubscribeButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!paidTierVisible) return null;

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const origin = window.location.origin;
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
        setError(body.error ?? `Checkout failed (${res.status})`);
        return;
      }
      window.location.href = body.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Redirecting…" : label}
      </button>
      {error && (
        <div role="alert" aria-live="polite">
          {error}
        </div>
      )}
    </div>
  );
}
