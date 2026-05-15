/**
 * Stripe Checkout success redirect target.
 *
 * Stripe sends customers here after a completed Checkout. The `session_id`
 * query param is set by Stripe when our `success_url` includes the
 * `{CHECKOUT_SESSION_ID}` template — see SubscribeButton's URL construction.
 *
 * Post-checkout race: the Stripe webhook (`/api/stripe/webhook`) issues the
 * license token asynchronously. If the customer lands here before the
 * webhook has finished, there is nothing yet to display. We close that gap
 * by polling `/api/license/retrieve?sessionId=...` every 3s for up to 30s,
 * auto-filling the LicenseTokenInput once the token arrives.
 *
 * UX contract:
 *  - Confirmation heading so the customer knows the payment landed.
 *  - LicenseTokenInput inline so they can verify/paste their token. With
 *    polling wired, the typical flow is "wait a few seconds → token
 *    appears" — manual paste is the fallback for any edge case.
 *  - "Manage subscription" button opens the Stripe Customer Portal so
 *    customers can self-serve cancel, update payment method, view invoices.
 *  - Stripe session ID echoed in plain text for support debugging.
 *  - A clear way back to the reader.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { LicenseTokenInput } from "@/components/billing/license-token-input";
import {
  getLicenseToken,
  setLicenseToken,
} from "@/core/license/license-token-store";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_DURATION_MS = 30_000;

export function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [autoFilledToken, setAutoFilledToken] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useTokenAutoFill(sessionId, setAutoFilledToken);

  async function onManageSubscription() {
    if (!sessionId) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/license/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          returnUrl: window.location.href,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setPortalError(body.error ?? `Portal failed (${res.status})`);
        return;
      }
      window.location.href = body.url;
    } catch (e) {
      setPortalError((e as Error).message);
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">
        Thanks for subscribing to FeedZero
      </h1>

      <p>
        Your payment has been processed. Your license token is shown below —
        save it somewhere safe; you'll need it to activate sync on every
        device you use.
      </p>

      {autoFilledToken && (
        <p role="status" aria-live="polite" className="text-sm">
          We retrieved your token automatically. Click <strong>Save</strong>{" "}
          below to activate sync.
        </p>
      )}

      <LicenseTokenInput paidTierVisible={true} />

      {sessionId && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onManageSubscription}
            disabled={portalBusy}
            aria-busy={portalBusy}
          >
            {portalBusy ? "Opening…" : "Manage subscription"}
          </button>
          {portalError && (
            <div role="alert" aria-live="polite">
              {portalError}
            </div>
          )}
        </div>
      )}

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

/**
 * Polls `/api/license/retrieve` until we get a token or the deadline expires.
 * No-op when there's no session_id (direct navigation) or when a token is
 * already in localStorage (returning customer).
 *
 * The polling deliberately fires the FIRST request synchronously on mount —
 * if the webhook is already done, we want the token to appear instantly, not
 * after a 3-second wait.
 */
function useTokenAutoFill(
  sessionId: string | null,
  onFilled: (token: string) => void,
): void {
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    if (!sessionId) return;
    if (getLicenseToken()) return;

    const deadline = Date.now() + POLL_MAX_DURATION_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function attempt(): Promise<void> {
      if (stopped.current) return;
      try {
        const res = await fetch("/api/license/retrieve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (res.status === 200) {
          const body = await res.json();
          if (body.ok && typeof body.token === "string") {
            setLicenseToken(body.token);
            onFilled(body.token);
            return;
          }
        }
        // 202 pending OR 4xx (still worth one retry — webhook may catch up).
        if (Date.now() + POLL_INTERVAL_MS < deadline) {
          timer = setTimeout(attempt, POLL_INTERVAL_MS);
        }
      } catch {
        // Network blip — try again until the deadline.
        if (Date.now() + POLL_INTERVAL_MS < deadline) {
          timer = setTimeout(attempt, POLL_INTERVAL_MS);
        }
      }
    }

    void attempt();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, onFilled]);
}
