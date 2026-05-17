/**
 * Recovery tab — how to get back into FeedZero if you've lost access.
 *
 * Two complementary surfaces:
 *   1. <LicenseTokenPasteForm> — paste an `fz_…` token you've saved (or
 *      received via Stripe's email recovery). On success the user's tier
 *      flips to paid on this device.
 *   2. <ContactSupport> — direct mailto + "Email my license to me" when
 *      a token is already present (defense in depth: the user can keep
 *      a copy in their inbox).
 *
 * A separate note points users at Data → Lost passphrase for the
 * passphrase-recovery case (we deliberately cannot help with that, and
 * the messaging needs to live near the sync UI it concerns).
 */
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { LicenseTokenPasteForm } from "@/components/settings/license-token-paste-form";
import { ContactSupport } from "@/components/settings/contact-support";
import { getLicenseToken } from "@/core/license/license-token-store";
import { decodeLicensePayload } from "@/core/license/format";
import { base64UrlDecodeToString } from "@/core/license/crypto";
import { goToSettings } from "@/lib/go-to-settings";

const TOKEN_PREFIX = "fz_";

function decodeCustomerId(token: string | null): string | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const [encoded] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!encoded) return null;
  const raw = base64UrlDecodeToString(encoded);
  if (!raw) return null;
  const result = decodeLicensePayload(raw);
  return result.ok ? result.value.customerId : null;
}

export function RecoveryTab() {
  const navigate = useNavigate();
  const token = getLicenseToken();
  const customerId = decodeCustomerId(token);

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Paste a license token</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Activate FeedZero on this device by pasting an{" "}
            <code className="font-mono">fz_…</code> token. You can find your
            token in the welcome email or in Subscription on another device.
          </p>
        </div>

        <LicenseTokenPasteForm
          inputId="recovery-token"
          submitLabel="Activate"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Recover by email</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Don&apos;t have your token? Stripe can send a sign-in link to the
            email on your subscription.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/billing/recover" target="_blank" rel="noreferrer noopener">
            <ExternalLink className="mr-2 size-4" />
            Open recovery page
          </a>
        </Button>
      </div>

      <ContactSupport token={token} customerId={customerId} />

      <p className="text-xs text-muted-foreground">
        Lost your sync passphrase instead? See{" "}
        <button
          type="button"
          onClick={() => goToSettings(navigate, "data")}
          className="underline hover:no-underline"
        >
          Data
        </button>
        {" "}— the passphrase isn&apos;t something we can recover.
      </p>
    </div>
  );
}
