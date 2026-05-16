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
 * piping the resulting token into LicenseTokenInput which auto-verifies it
 * server-side.
 *
 * UX states the user can see:
 *  - polling  — spinner + "Retrieving your license…". The default visible
 *    state while we wait on the webhook → Upstash → re-sign chain.
 *  - success  — checkmark alert + populated, auto-verified input.
 *  - timeout  — destructive alert that exposes the session id as a support
 *    diagnostic, and invites the user to paste a token they may already have.
 *
 * The session id is intentionally NOT rendered as page chrome on the happy
 * path. It only appears inside the timeout alert, where it serves a purpose.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { LicenseTokenInput } from "@/components/billing/license-token-input";
import {
  getLicenseToken,
  setLicenseToken,
} from "@/core/license/license-token-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_DURATION_MS = 30_000;

type Phase = "polling" | "success" | "timeout";

export function BillingSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [autoFilledToken, setAutoFilledToken] = useState<string | null>(() =>
    getLicenseToken(),
  );
  const [phase, setPhase] = useState<Phase>(() => {
    if (getLicenseToken()) return "success";
    if (sessionId) return "polling";
    return "success";
  });
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useTokenAutoFill(
    sessionId,
    (token) => {
      setAutoFilledToken(token);
      setPhase("success");
    },
    () => setPhase("timeout"),
  );

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
    <div className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">
        Thanks for subscribing to FeedZero
      </h1>

      <p className="text-muted-foreground">
        Your payment was processed. We&apos;ve activated sync on this device —
        nothing else to do.
      </p>

      {phase === "polling" && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertDescription role="status" aria-live="polite">
            Retrieving your license… this normally takes a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {phase === "success" && autoFilledToken && (
        <Alert>
          <CheckCircle2 />
          <AlertDescription role="status" aria-live="polite">
            Your subscription is active. We&apos;ve saved your license to this
            browser.
          </AlertDescription>
        </Alert>
      )}

      {phase === "timeout" && sessionId && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription role="alert" aria-live="polite">
            We couldn&apos;t retrieve your license automatically. If you have
            your token, paste it below. Otherwise email{" "}
            <a
              href="mailto:support@feedzero.app"
              className="underline underline-offset-2"
            >
              support@feedzero.app
            </a>{" "}
            and quote session <code>{sessionId}</code>.
          </AlertDescription>
        </Alert>
      )}

      <LicenseTokenInput
        paidTierVisible={true}
        value={autoFilledToken ?? undefined}
      />

      {sessionId && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={onManageSubscription}
            disabled={portalBusy}
            aria-busy={portalBusy}
          >
            {portalBusy ? "Opening…" : "Manage subscription"}
          </Button>
          {portalError && (
            <Alert variant="destructive">
              <AlertDescription role="alert" aria-live="polite">
                {portalError}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div>
        <Button asChild>
          <a href="/feeds">Continue to FeedZero</a>
        </Button>
      </div>
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
 * after a 3-second wait. On deadline exhaustion, `onTimeout` lets the parent
 * switch to the timeout-state UI rather than silently giving up.
 */
function useTokenAutoFill(
  sessionId: string | null,
  onFilled: (token: string) => void,
  onTimeout: () => void,
): void {
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    if (!sessionId) return;
    if (getLicenseToken()) return;

    const deadline = Date.now() + POLL_MAX_DURATION_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextOrTimeout(): void {
      if (Date.now() + POLL_INTERVAL_MS < deadline) {
        timer = setTimeout(attempt, POLL_INTERVAL_MS);
      } else {
        onTimeout();
      }
    }

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
        scheduleNextOrTimeout();
      } catch {
        scheduleNextOrTimeout();
      }
    }

    void attempt();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, onFilled, onTimeout]);
}
