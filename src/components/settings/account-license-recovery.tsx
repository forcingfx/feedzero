/**
 * <AccountLicenseRecovery> — what the user needs to recover their license.
 *
 * Replaces the older AccountSafetyControls (which bundled email-self,
 * sheet download, and support into one card). Simpler surface:
 *   - Support email shown prominently so the user always knows where to
 *     reach us (the most important contact info; we never show the user's
 *     own email — that lives only in their Stripe account).
 *   - "Email my license to me" — mailto with the token in the body, so
 *     the inbox archive is a recovery store.
 *   - "Open recovery page →" — link to /billing/recover, the Stripe
 *     magic-link cross-device flow.
 *   - Footer: small Contact support link with diagnostic context.
 *
 * The "Download recovery sheet" .txt has been dropped as redundant with
 * email-self — the email lives in the user's inbox indefinitely.
 */
import { Mail, ExternalLink, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "support@feedzero.app";

interface AccountLicenseRecoveryProps {
  token: string;
  customerId: string;
}

function buildEmailMyselfHref(token: string): string {
  const subject = "My FeedZero license";
  const body = `Save this email — it has your FeedZero license token.

License token:
${token}

To activate FeedZero on another device:
  1. Open https://my.feedzero.app/billing/recover
  2. Enter your email — you'll receive a sign-in link from Stripe
  3. Open it on the new device

Or paste the token above into Settings → Account on the new device.

—
FeedZero`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSupportHref(token: string, customerId: string): string {
  const subject = "FeedZero license help";
  const body = `(Tell us what's happening — we can usually help recover access.)




—— Diagnostic info (please leave this here) ——
Customer ID: ${customerId}
License token: ${token.slice(0, 10)}…${token.slice(-6)}
Time: ${new Date().toISOString()}
URL: ${typeof window !== "undefined" ? window.location.origin : ""}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function AccountLicenseRecovery({
  token,
  customerId,
}: AccountLicenseRecoveryProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">If you lose access</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          We're here:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-mono underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={buildEmailMyselfHref(token)}>
            <Mail className="mr-2 size-4" />
            Email my license to me
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/billing/recover">
            <ExternalLink className="mr-2 size-4" />
            Open recovery page
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground pt-1 border-t border-border">
        Stuck?{" "}
        <a
          href={buildSupportHref(token, customerId)}
          className="underline inline-flex items-center gap-1"
        >
          <LifeBuoy className="size-3" />
          Contact support
        </a>
      </p>
    </div>
  );
}
