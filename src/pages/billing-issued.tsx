/**
 * /billing/issued — landing page after the customer returns from the Stripe
 * Customer Portal.
 *
 * Reads the signed `recovery` query param (created at /billing/recover, gated
 * by Stripe's portal magic-link), exchanges it for the customer's license
 * token via /api/license/issue-from-recovery, persists locally, and shows
 * the activation confirmation.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Sparkles } from "lucide-react";
import { setLicenseToken } from "@/core/license/license-token-store";
import { useLicenseStore } from "@/stores/license-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Phase = "issuing" | "success" | "error" | "missing-token";

export function BillingIssued() {
  const [searchParams] = useSearchParams();
  const recoveryToken = searchParams.get("recovery");

  const [phase, setPhase] = useState<Phase>(() =>
    recoveryToken ? "issuing" : "missing-token",
  );
  const [tier, setTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recoveryToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/license/issue-from-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recoveryToken }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setError(body.error ?? `Recovery failed (${res.status})`);
          setPhase("error");
          return;
        }
        // Persist + wake the license-store so the rest of the app reflects
        // the active tier without a reload.
        setLicenseToken(body.token);
        void useLicenseStore.getState().refresh();
        setTier(body.tier);
        setPhase("success");
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryToken]);

  if (phase === "missing-token" || phase === "error") {
    const supportBody =
      `Phase: ${phase}\n` +
      (error ? `Error: ${error}\n` : "") +
      `\n(Add your subscription email and anything else helpful here.)`;
    const supportHref =
      "mailto:support@feedzero.app?" +
      `subject=${encodeURIComponent("Recovery link didn't work")}&` +
      `body=${encodeURIComponent(supportBody)}`;
    return (
      <div className="mx-auto max-w-md p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Recovery link {phase === "missing-token" ? "missing" : "invalid"}</h1>
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error ??
              "We couldn't find a recovery token in this link. The link may have expired or been used already."}
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <a href="/billing/recover">Try again</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Already tried this?{" "}
            <a href={supportHref} className="underline">
              Email support
            </a>{" "}
            with your subscription email — we&apos;ll issue your license
            directly.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "issuing") {
    return (
      <div className="mx-auto max-w-md p-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Restoring your license…</h1>
        <p className="text-sm text-muted-foreground">
          This usually takes a couple of seconds.
        </p>
      </div>
    );
  }

  // success
  return (
    <div className="mx-auto max-w-md p-8 space-y-6">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-emerald-600" />
          <h1 className="text-lg font-semibold">
            Welcome back to {tier === "personal" ? "Personal" : "FeedZero"}
          </h1>
        </div>
        <p className="text-sm">
          Sync activated on this device. Your feeds and reading state will
          sync across every device you use.
        </p>
      </div>
      <Button asChild className="w-full">
        <a href="/feeds">Continue to FeedZero →</a>
      </Button>
    </div>
  );
}
