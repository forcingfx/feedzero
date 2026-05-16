/**
 * Layered safety net for "I lost my license" — rendered inside the
 * Account tab for paid customers.
 *
 * Three preemptive / reactive recovery options:
 *   1. Email myself the token — mailto: prepopulated with the token
 *   2. Download recovery sheet — .txt with token + customer ID + URLs
 *   3. Contact support — mailto: with diagnostic context
 *
 * All three use the user's mail client (mailto:) — no new server-side
 * email infrastructure required. The Stripe receipt email is already the
 * record-of-payment; this is the record-of-license.
 */
import { Mail, Download, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "support@feedzero.app";

interface AccountSafetyControlsProps {
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

function buildRecoverySheet(token: string, customerId: string): string {
  return `FeedZero — Recovery Sheet
Generated: ${new Date().toISOString()}

License token:
  ${token}

Customer ID:
  ${customerId}

To activate on a new device:
  1. Open https://my.feedzero.app/billing/recover
  2. Enter the email you used at checkout
  3. Click the Stripe sign-in link in your inbox
  4. You'll land in FeedZero with sync activated

Or paste the License token above into:
  Settings → Account → License token (paste field)

If something goes wrong:
  Email ${SUPPORT_EMAIL}
  Include your Customer ID above for fast triage.

Keep this file somewhere safe (password manager, Drive, paper printout).
`;
}

export function AccountSafetyControls({
  token,
  customerId,
}: AccountSafetyControlsProps) {
  function onDownloadRecoverySheet() {
    const content = buildRecoverySheet(token, customerId);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedzero-recovery-${customerId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">If you ever lose access</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Save your license so you can recover it from any device, even
          offline.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={buildEmailMyselfHref(token)}>
            <Mail className="mr-2 size-4" />
            Email this license to me
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDownloadRecoverySheet}
        >
          <Download className="mr-2 size-4" />
          Download recovery sheet
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={buildSupportHref(token, customerId)}>
            <LifeBuoy className="mr-2 size-4" />
            Contact support
          </a>
        </Button>
      </div>
    </div>
  );
}
