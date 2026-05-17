/**
 * Shared contact-support card used in Recovery and Help tabs.
 *
 * Renders:
 *   - prominent support email
 *   - optional "Email my license to me" mailto (only when a token exists)
 *   - "Contact support" mailto with diagnostic context in the body
 *
 * `diagnosticContext` lets each caller customize what extra info goes
 * into the support email body — Recovery includes the masked token + the
 * Stripe customer id; Help includes the current URL + a hint that this
 * was sent from the in-app help surface.
 */
import { Mail, ExternalLink, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskToken } from "@/lib/format-license";

export const SUPPORT_EMAIL = "support@feedzero.app";

interface ContactSupportProps {
  /** License token if the user has one. Drives "Email my license to me". */
  token?: string | null;
  /** Customer id when known — included verbatim in the diagnostic body. */
  customerId?: string | null;
  /** Extra label/value pairs appended to the diagnostic block. */
  diagnosticContext?: Record<string, string>;
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

Or paste the token above into Settings → Recovery on the new device.

—
FeedZero`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSupportHref({
  token,
  customerId,
  diagnosticContext,
}: ContactSupportProps): string {
  const subject = "FeedZero help";
  const lines: string[] = ["(Tell us what's happening — we'll help.)", "", "", "—— Diagnostic info (please leave this here) ——"];
  if (customerId) lines.push(`Customer ID: ${customerId}`);
  if (token) lines.push(`License token: ${maskToken(token)}`);
  if (diagnosticContext) {
    for (const [k, v] of Object.entries(diagnosticContext)) {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(
    `URL: ${typeof window !== "undefined" ? window.location.origin : ""}`,
  );
  const body = lines.join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ContactSupport(props: ContactSupportProps) {
  const { token } = props;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Need help?</h3>
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
        {token && (
          <Button asChild variant="outline" size="sm">
            <a href={buildEmailMyselfHref(token)}>
              <Mail className="mr-2 size-4" />
              Email my license to me
            </a>
          </Button>
        )}
        {token && (
          <Button asChild variant="outline" size="sm">
            <a href="/billing/recover">
              <ExternalLink className="mr-2 size-4" />
              Open recovery page
            </a>
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground pt-1 border-t border-border">
        Stuck?{" "}
        <a
          href={buildSupportHref(props)}
          className="underline inline-flex items-center gap-1"
        >
          <LifeBuoy className="size-3" />
          Contact support
        </a>
      </p>
    </div>
  );
}
