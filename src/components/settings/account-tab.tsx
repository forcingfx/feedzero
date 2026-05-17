/**
 * Account tab — in-product license + billing surface.
 *
 * Closes four customer-facing UX gaps:
 *   1. See current tier and renewal date (was: invisible after first session)
 *   2. See and copy the license token (was: only visible on /billing/success)
 *   3. Open Stripe Customer Portal to manage billing / cancel (was: only on
 *      /billing/success which the user couldn't reach again)
 *   4. Link to /billing/recover so a paying user can activate on another
 *      device (was: no entry point in the app)
 *
 * For free users this tab pivots to a Subscribe CTA — the rest of the
 * controls don't apply when there's no subscription to manage.
 */
import { useState } from "react";
import { Sparkles, Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLicenseStore } from "@/stores/license-store";
import {
  getLicenseToken,
  clearLicenseToken,
} from "@/core/license/license-token-store";
import { decodeLicensePayload } from "@/core/license/format";
import { base64UrlDecodeToString } from "@/core/license/crypto";
import type { LicensePayload } from "@/core/license/format";
import { AccountUpgradeSection } from "./account-upgrade-section";
import { AccountSyncSection } from "./account-sync-section";
import { AccountLicenseRecovery } from "./account-license-recovery";
import { openPortal } from "@/lib/open-portal";

const TOKEN_PREFIX = "fz_";

function decodePayload(token: string | null): LicensePayload | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const [encoded] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!encoded) return null;
  const raw = base64UrlDecodeToString(encoded);
  if (!raw) return null;
  const result = decodeLicensePayload(raw);
  return result.ok ? result.value : null;
}

function formatRenewal(expirySec: number): string {
  const date = new Date(expirySec * 1000);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Mask the token to the SAME character width as the real token, preserving
 * the `fz_` prefix and the `.` separator. Same width = no layout jitter
 * when the user toggles reveal/hide.
 *
 * Format: `fz_<payload>.<sig>` → `fz_••••.••••` with dot-counts derived
 * from the actual payload and sig lengths.
 */
function maskToken(token: string): string {
  const PREFIX = "fz_";
  if (!token.startsWith(PREFIX)) {
    // Fallback for malformed tokens — match overall width, opaque.
    return "•".repeat(Math.max(token.length, 8));
  }
  const body = token.slice(PREFIX.length);
  const dotIdx = body.indexOf(".");
  if (dotIdx < 0) {
    return PREFIX + "•".repeat(body.length);
  }
  const payloadLen = dotIdx;
  const sigLen = body.length - dotIdx - 1;
  return `${PREFIX}${"•".repeat(payloadLen)}.${"•".repeat(sigLen)}`;
}

export function AccountTab() {
  const tier = useLicenseStore((s) => s.tier);
  const refresh = useLicenseStore((s) => s.refresh);

  if (tier === "free") {
    return <FreeView />;
  }

  return <PaidView tier={tier} onSignOut={() => void refresh()} />;
}

function FreeView() {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-50 text-slate-600 border-slate-200">
          Free
        </span>
        <span className="text-sm text-muted-foreground">
          You&apos;re on the Free tier.
        </span>
      </div>
      <AccountUpgradeSection />
    </div>
  );
}

interface PaidViewProps {
  tier: "personal" | "pro";
  onSignOut: () => void;
}

function PaidView({ tier, onSignOut }: PaidViewProps) {
  const token = getLicenseToken();
  const payload = decodePayload(token);

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  async function onCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setPortalError("Couldn't copy to clipboard.");
    }
  }

  async function onManageSubscription() {
    if (!token) return;
    setPortalBusy(true);
    setPortalError(null);
    const result = await openPortal();
    if (!result.ok) {
      setPortalError(result.error ?? `Portal failed`);
    }
    setPortalBusy(false);
  }

  function onSignOutClick() {
    clearLicenseToken();
    onSignOut();
  }

  const tierLabel = tier === "personal" ? "Personal" : "Pro";
  const priceLabel = tier === "personal" ? "$5/month" : "$19/month";

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
            <Sparkles className="size-3" />
            {tierLabel}
          </span>
          <span className="text-sm text-muted-foreground">
            {priceLabel}
            {payload && (
              <>
                {" "}
                · renews{" "}
                <span className="font-medium text-foreground">
                  {formatRenewal(payload.expirySec)}
                </span>
              </>
            )}
          </span>
        </div>

        {token && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              License token
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded overflow-x-auto whitespace-nowrap">
                {revealed ? token : maskToken(token)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? "Hide token" : "Reveal token"}
                title={revealed ? "Hide" : "Reveal"}
              >
                {revealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCopy}
                aria-label="Copy token"
                title={copied ? "Copied!" : "Copy"}
              >
                {copied ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this token to activate FeedZero on other devices, or use the
              Add another device link below.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            onClick={onManageSubscription}
            disabled={portalBusy}
            aria-busy={portalBusy}
          >
            {portalBusy ? "Opening Stripe…" : "Manage subscription"}
          </Button>
          <Button asChild variant="outline">
            <a href="/billing/recover" target="_blank" rel="noreferrer noopener">
              Add another device →
            </a>
          </Button>
        </div>

        {portalError && (
          <Alert variant="destructive">
            <AlertDescription>{portalError}</AlertDescription>
          </Alert>
        )}
      </div>

      <AccountSyncSection />

      {token && payload && (
        <AccountLicenseRecovery
          token={token}
          customerId={payload.customerId}
        />
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">
          Signing out removes your license token from this browser only. Your
          subscription stays active and reading data on this device is
          preserved.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onSignOutClick}>
          Sign out of this device
        </Button>
      </div>
    </div>
  );
}
