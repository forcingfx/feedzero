/**
 * /billing/recover — public entry point for cross-device license recovery.
 *
 * The customer is on Device B (or has lost local storage). They enter their
 * email; we look up the Stripe customer and create a portal session whose
 * return_url carries a signed recovery token. Stripe sends the magic-link
 * email — the customer clicks it, lands in the portal authenticated, and
 * the portal's "Return to merchant" sends them to /billing/issued where
 * their license is reissued.
 *
 * Enumeration protection: unknown emails get the same "check your email"
 * confirmation as known ones. The Stripe magic-link gate is the real
 * auth boundary; we just don't help an attacker probe for paying customers.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Phase = "idle" | "submitting" | "sent" | "error";

const TROUBLESHOOT_DELAY_MS = 60_000;
const SUPPORT_EMAIL = "support@feedzero.app";

export function BillingRecover() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  // If the query param changes after mount (e.g. navigation from Account tab),
  // keep the input in sync. Without this the prefill only works on first mount.
  useEffect(() => {
    const fromQuery = searchParams.get("email");
    if (fromQuery && fromQuery !== email) setEmail(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // After the "check your email" confirmation appears, surface
  // troubleshooting + support after a delay. Customers who hit a real
  // problem (wrong email, Stripe email config off) need a path forward
  // beyond the spinning hope-it-works message.
  useEffect(() => {
    if (phase !== "sent") {
      setShowTroubleshoot(false);
      return;
    }
    const timer = setTimeout(() => setShowTroubleshoot(true), TROUBLESHOOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/license/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Recovery failed (${res.status})`);
        setPhase("error");
        return;
      }
      // Two legitimate 200 outcomes:
      //  (a) portalUrl present → known customer → redirect immediately
      //  (b) no portalUrl → unknown email → show confirmation anyway
      //      (enumeration protection — attacker can't distinguish)
      if (typeof body.portalUrl === "string" && body.portalUrl.length > 0) {
        window.location.href = body.portalUrl;
        return;
      }
      setPhase("sent");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  }

  return (
    <div className="mx-auto max-w-md p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Recover your license</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email you used to subscribe. We&apos;ll send you a sign-in
          link via Stripe — open it on this device, then click{" "}
          <strong>&ldquo;Return to FeedZero&rdquo;</strong> at the top of the
          Stripe page to finish activating your license here.
        </p>
      </header>

      {phase === "sent" ? (
        <>
          <Alert>
            <AlertDescription>
              Check your email. If a subscription exists for{" "}
              <strong>{email}</strong>, Stripe will send you a sign-in link in
              the next few minutes. Open it on this device, sign in, then
              click <strong>&ldquo;Return to FeedZero&rdquo;</strong> at the
              top of the Stripe page to activate your license.
            </AlertDescription>
          </Alert>
          {showTroubleshoot && (
            <div className="rounded-md border border-border bg-card p-4 text-sm space-y-2">
              <p className="font-medium">Didn&apos;t get an email?</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1 text-xs">
                <li>
                  Check your spam / promotions folder. Stripe&apos;s sign-in
                  link sometimes lands there.
                </li>
                <li>
                  Double-check the email you used at checkout — try a typo
                  or a secondary inbox.
                </li>
                <li>
                  Already signed in to Stripe and don&apos;t see a{" "}
                  <strong>&ldquo;Return to FeedZero&rdquo;</strong> link at the
                  top? Email{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Can't recover my FeedZero license")}&body=${encodeURIComponent(
                      `Email I used at checkout: ${email}\n\nI signed in to Stripe but couldn't find the Return to FeedZero link.\n`,
                    )}`}
                    className="underline"
                  >
                    support@feedzero.app
                  </a>{" "}
                  — we can issue your license manually.
                </li>
                <li>
                  Still stuck for another reason?{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Can't recover my FeedZero license")}&body=${encodeURIComponent(
                      `Email I used at checkout: ${email}\n\n(Anything else helpful here.)`,
                    )}`}
                    className="underline"
                  >
                    Contact support
                  </a>{" "}
                  with the email you used at checkout — we can usually
                  recover access manually.
                </li>
              </ul>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recover-email">Email</Label>
            <Input
              id="recover-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={phase === "submitting" || !email.trim()}
            className="w-full"
          >
            {phase === "submitting" ? "Looking up…" : "Recover license"}
          </Button>
        </form>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Subscribed on a different device but never paid here?{" "}
        <a href="/?subscribe=personal-monthly" className="underline">
          Start a new subscription
        </a>
        .
      </p>
    </div>
  );
}
