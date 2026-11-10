/**
 * Subscription tab — what plan am I on, and how do I activate / pay for it?
 *
 * Free users see, in order:
 *   1. Tier badge (Free).
 *   2. Large "Activate existing license" CTA — opens the license-token
 *      paste dialog. This is the surface a returning customer or someone
 *      activating a second device lands on; it lived as a muted "Log in"
 *      link inside the pricing comparison before this redesign, which
 *      buried it.
 *   3. "Lost your license?" recovery link → opens /billing/recover.
 *   4. "or subscribe" divider, then the tier comparison cards.
 *
 * Paid users see:
 *   - tier card with renewal date
 *   - truncated license key with reveal+copy
 *   - "Manage subscription" → Stripe Customer Portal via openPortal()
 *   - "Deactivate on this device" section
 *   - "Looking for a different plan?" footer showing only the *other*
 *     tier cards (upgrade or downgrade affordances).
 */
import { useState } from "react";
import {
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  LogOut,
  Info,
  KeyRound,
  ExternalLink,
} from "lucide-react";
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
import { SubscriptionUpgrade, TierCard } from "@/components/settings/subscription-upgrade";
import { tierLabel as tierLabelFor } from "@/core/features/tier-matrix";
import { PAID_PLAN } from "@/core/features/pricing";
import type { Tier } from "@/core/features/tier-matrix";
import { ActivateLicenseDialog } from "@/components/settings/activate-license-dialog";
import { SettingRow, SettingsGroup } from "@/components/settings/setting-row";
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
  const [activateOpen, setActivateOpen] = useState(false);
  const [comparing, setComparing] = useState(false);

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground">
          Free
        </span>
        <span className="text-sm text-muted-foreground">
          You&apos;re on the Free tier.
        </span>
      </div>

      {/* One line of price. The full comparison opens on request
          instead of filling the tab (audit 2026-Q4, finding 5). */}
      <div className="space-y-3">
        <p className="text-sm">
          Supporter adds unlimited feeds, Signal, smart filters, auto-organize
          and offline prefetch. {PAID_PLAN.display}, {PAID_PLAN.trialDays} days
          free.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={comparing}
            onClick={() => setComparing((c) => !c)}
          >
            {comparing ? "Hide plans" : "Compare plans"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActivateOpen(true)}
          >
            <KeyRound className="mr-2 size-4" />
            Activate existing license
          </Button>
          <a
            href="/billing/recover"
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground underline hover:no-underline inline-flex items-center gap-1"
          >
            Lost your license?
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {comparing && <SubscriptionUpgrade />}

      <ActivateLicenseDialog open={activateOpen} onOpenChange={setActivateOpen} />
    </div>
  );
}

interface PaidViewProps {
  tier: Exclude<Tier, "free">;
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

  // Both derived, not branched: there is one paid tier now, and the label
  // is whatever the matrix calls it. The old ternary is how a `$19/month`
  // Pro price outlived every other surface saying "Coming 2026".
  const planLabel = tierLabelFor(tier);
  const priceLabel = PAID_PLAN.display;

  return (
    <div className="space-y-8 py-2">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-success-bg text-success border-success/30">
            <Sparkles className="size-3" />
            {planLabel}
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
                  <Check className="size-4 text-success" />
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
                onClick={() => goToSettings(navigate, "sync-and-data")}
                className="underline hover:no-underline"
              >
                Sync &amp; Data
              </button>
              .
            </span>
          </div>
        )}
      </div>

      <SettingsGroup title="Deactivate on this device">
        <SettingRow
          label="Remove the license from this browser"
          description="Your subscription stays active, your cloud vault is preserved, and your local feeds and articles are untouched. Paid features lock to the free tier on this device until you reactivate."
        >
          <Button type="button" variant="outline" size="sm" onClick={() => setDeactivateOpen(true)}>
            <LogOut className="mr-2 size-4" />
            Deactivate FeedZero {planLabel} on this device
          </Button>
        </SettingRow>
      </SettingsGroup>

      <AlternativePlans />

      <DeactivateConfirm
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        pending={deactivatePending}
        onConfirm={onConfirmDeactivate}
        tierLabel={planLabel}
      />
    </div>
  );
}

/**
 * Compact "looking for a different plan?" strip for paid users.
 *
 * With Pro retired there is no other paid tier to move to, so this is now
 * just the Self-host escape hatch. It stays because self-hosting is a real
 * alternative for a paying customer, and because a subscriber who wants
 * out should find the exit next to the Deactivate action rather than hunt
 * for it. We deliberately omit the Free card — telling a paying customer
 * "downgrade to Free" would bury the Deactivate action right above.
 */
function AlternativePlans() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        Looking for a different plan?
      </p>
      <TierCard
        name="Self-host"
        price="$0 · AGPL"
        blurb="Run your own copy. Every shipped feature unlocked."
        features={[
          "Unlimited feeds, cloud sync on your own server",
          "No license check, no kill switch",
          "Open source under AGPL-3.0",
        ]}
        cta="Self-hosting guide →"
        ctaHref="https://www.feedzero.app/docs/self-hosting"
        ctaTargetBlank
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
            time by pasting the token again, or via{" "}
            <a
              href="/billing/recover"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              email recovery
            </a>
            .
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
