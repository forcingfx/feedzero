/**
 * Subscription tab — tier badge, license-token reveal, billing portal.
 *
 * Free users see <SubscriptionUpgrade> (the tier comparison cards).
 * Paid users see:
 *   - tier card with renewal date
 *   - truncated license key with reveal+copy
 *   - "Manage subscription" → Stripe Customer Portal via openPortal()
 *   - inline "Need another device? See Recovery →" cross-link
 *
 * The "Add another device" action that used to live here moved to the
 * Recovery tab — pasting a token is a recovery surface, not a billing
 * one. PR C will add a "Deactivate FeedZero Personal on this device"
 * button to this tab.
 */
import { useState } from "react";
import { Sparkles, Eye, EyeOff, Copy, Check, LogOut, Info } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLicenseStore } from "@/stores/license-store";
import { useSyncStore } from "@/stores/sync-store";
import { getLicenseToken } from "@/core/license/license-token-store";
import { decodeLicensePayload } from "@/core/license/format";
import { base64UrlDecodeToString } from "@/core/license/crypto";
import type { LicensePayload } from "@/core/license/format";
import { SubscriptionUpgrade } from "@/components/settings/subscription-upgrade";
import { openPortal } from "@/lib/open-portal";
import { maskToken } from "@/lib/format-license";
import { goToSettings } from "@/lib/go-to-settings";

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

export function SubscriptionTab() {
  const tier = useLicenseStore((s) => s.tier);

  if (tier === "free") {
    return <FreeView />;
  }

  return <PaidView tier={tier} />;
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
      <SubscriptionUpgrade />
    </div>
  );
}

interface PaidViewProps {
  tier: "personal" | "pro";
}

function PaidView({ tier }: PaidViewProps) {
  const navigate = useNavigate();
  const token = getLicenseToken();
  const payload = decodePayload(token);
  const syncStatus = useSyncStore((s) => s.status);
  const deactivateLocal = useSyncStore((s) => s.deactivateLocal);

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivatePending, setDeactivatePending] = useState(false);

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

  async function onConfirmDeactivate() {
    setDeactivatePending(true);
    await deactivateLocal();
    setDeactivatePending(false);
    setDeactivateOpen(false);
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
        </div>

        <p className="text-xs text-muted-foreground">
          Need to activate on another device?{" "}
          <button
            type="button"
            onClick={() => goToSettings(navigate, "recovery")}
            className="underline hover:no-underline"
          >
            See Recovery →
          </button>
        </p>

        {portalError && (
          <Alert variant="destructive">
            <AlertDescription>{portalError}</AlertDescription>
          </Alert>
        )}

        {syncStatus === "synced" && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            <span>
              Sync stays on while your subscription is active. To disable
              sync without canceling, use{" "}
              <button
                type="button"
                onClick={() => goToSettings(navigate, "data")}
                className="underline hover:no-underline"
              >
                Data → Switch to local only
              </button>
              .
            </span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold">Deactivate on this device</h3>
        <p className="text-xs text-muted-foreground">
          Removes the license token from this browser only. Your
          subscription stays active, your cloud vault is preserved, and
          your local feeds + articles are untouched — but paid features
          (sync, auto-organize, unlimited feeds) lock to the free tier
          on this device until you reactivate.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDeactivateOpen(true)}
        >
          <LogOut className="mr-2 size-4" />
          Deactivate FeedZero {tierLabel} on this device
        </Button>
      </div>

      <DeactivateConfirm
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        pending={deactivatePending}
        onConfirm={onConfirmDeactivate}
        tierLabel={tierLabel}
      />
    </div>
  );
}

interface DeactivateConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
  tierLabel: string;
}

function DeactivateConfirm({
  open,
  onOpenChange,
  pending,
  onConfirm,
  tierLabel,
}: DeactivateConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {tierLabel} on this device?</DialogTitle>
          <DialogDescription>
            We&apos;ll clear the license token from this browser and switch
            sync off locally. Your subscription stays active and your
            encrypted cloud vault stays intact — you can reactivate any
            time with the token (Recovery tab) or by signing in again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? "Deactivating…" : "Deactivate on this device"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
