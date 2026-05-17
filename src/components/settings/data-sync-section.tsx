/**
 * Cloud sync controls + delete-all-data, redesigned around a single toggle.
 *
 * The primary affordance is one <Switch>:
 *   - ON  → opens a chooser dialog: "Set up new sync" vs "Connect existing
 *     cloud store". Existing path always merges with local-precedence (no
 *     replace/merge picker; matches user spec).
 *   - OFF → opens the keep-or-delete cloud-vault confirmation fork.
 *
 * Gating:
 *   - Hosted, free tier → blurred overlay with "Upgrade plan" CTA. The
 *     prior "try sync, fail with 401" UX (PendingMigration) is unreachable
 *     for new users — the toggle isn't operable without a license.
 *   - Self-hosted → HEAD-probe /api/sync on mount; if unreachable, show
 *     the same overlay pattern with self-hosting docs link instead.
 *
 * "Delete all data and reset app" sits below the sync section and is
 * always clickable regardless of tier or sync state. Paid users get a
 * non-blocking warning that their Stripe subscription will keep billing.
 *
 * "Restore from cloud" and "Log out of this device" are exposed under a
 * collapsible "Advanced" group so the surface is calm for everyday users
 * but power-user affordances are still available.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Trash2,
  AlertTriangle,
  Loader2,
  Lock,
  ExternalLink,
  Info,
  DownloadCloud,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { generatePassphrase } from "@/core/crypto/passphrase-generator";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useAppStore } from "@/stores/app-store";
import { useLicenseStore } from "@/stores/license-store";
import { openPortal } from "@/lib/open-portal";
import { goToSettings } from "@/lib/go-to-settings";
import { isSelfHosted } from "@/core/features/self-hosted";
import { toast } from "sonner";
import { SetupWizard } from "@/components/sync/setup-wizard";
import { ExistingCloudFlow } from "@/components/sync/existing-cloud-flow";
import { LostPassphrasePanel } from "@/components/settings/tabs/lost-passphrase-panel";

type Confirmation = "none" | "delete" | "disable";
type SubFlow = "none" | "setup" | "existing" | "choose";

const SELF_HOST_DOCS_URL = "https://www.feedzero.app/docs/self-hosting";

/**
 * Probe the configured sync server. Used in self-hosted mode to decide if
 * the toggle should be operable. Any non-5xx response means the route is
 * mounted (even a 400 for missing vaultId is fine — the server is alive).
 * Fetch rejection or 5xx → server unreachable.
 */
async function probeSyncServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/sync", { method: "HEAD" });
    return res.status < 500;
  } catch {
    return false;
  }
}

export function DataSyncSection() {
  const navigate = useNavigate();
  const tier = useLicenseStore((s) => s.tier);
  const status = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.error);
  const enableSync = useSyncStore((s) => s.enableSync);
  const disableSync = useSyncStore((s) => s.disableSync);
  const deleteCloudVault = useSyncStore((s) => s.deleteCloudVault);
  const switchToExistingCloud = useSyncStore((s) => s.switchToExistingCloud);
  const resetApp = useAppStore((s) => s.resetApp);
  const localFeedCount = useFeedStore((s) => s.feeds.length);

  const [confirmation, setConfirmation] = useState<Confirmation>("none");
  const [subFlow, setSubFlow] = useState<SubFlow>("none");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);

  const selfHosted = isSelfHosted();
  const isOn = status === "synced" || status === "syncing" || status === "error";
  const isSyncing = status === "syncing";

  // Self-hosted probe — runs once on mount. Hosted users never trip this
  // branch (tier is the gate). Stored as tri-state so we can render a brief
  // "checking…" instead of flashing the overlay on the first paint.
  useEffect(() => {
    if (!selfHosted) return;
    let cancelled = false;
    void probeSyncServer().then((ok) => {
      if (!cancelled) setServerReachable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [selfHosted]);

  const tierGate = !selfHosted && tier === "free";
  const serverGate = selfHosted && serverReachable === false;
  const gated = tierGate || serverGate;

  const handleStartSetup = useCallback(async () => {
    setPassphrase(await generatePassphrase());
    setSubFlow("setup");
  }, []);

  const handleConnectExisting = useCallback(() => {
    setSubFlow("existing");
  }, []);

  function handleToggleChange(next: boolean) {
    if (gated) return;
    if (next && !isOn) {
      // Two ways to turn sync ON — let the user choose.
      setSubFlow("choose");
      return;
    }
    if (!next && isOn) {
      setConfirmation("disable");
    }
  }

  async function handleDisableKeepVault() {
    setPending(true);
    setDisableError(null);
    await disableSync();
    setPending(false);
    setConfirmation("none");
    toast("Sync disabled. Your cloud vault was preserved.");
  }

  async function handleDisableDeleteVault() {
    setPending(true);
    setDisableError(null);
    // Order matters: deleteCloudVault reads credentials that disableSync clears.
    const deleteResult = await deleteCloudVault();
    if (!deleteResult.ok) {
      setPending(false);
      setDisableError(
        `Couldn't delete cloud store: ${deleteResult.error}. Sync is still on locally — retry, or choose "Keep cloud store".`,
      );
      return;
    }
    await disableSync();
    setPending(false);
    setConfirmation("none");
    toast("Sync disabled. Cloud store deleted.");
  }

  async function handleDeleteAll() {
    setPending(true);
    // Best-effort vault deletion first (so we don't leave a server-side
    // orphan), then local reset, then local sync teardown.
    await deleteCloudVault();
    await resetApp();
    await disableSync();
    setPending(false);
    setConfirmation("none");
  }

  const statusDescription = (() => {
    if (gated) {
      return selfHosted
        ? "Cloud sync requires a reachable sync server."
        : "Cloud sync requires an active subscription.";
    }
    switch (status) {
      case "local-only":
        return "Your data stays in this browser only.";
      case "synced":
        return "Your data is encrypted and synced across devices.";
      case "syncing":
        return "Sync is in progress…";
      case "error":
        return syncError
          ? `Sync error: ${syncError}`
          : "There was a sync error. Please try again.";
    }
  })();

  return (
    <div className="space-y-4">
      <div
        className={`relative overflow-hidden rounded-lg border border-border bg-card ${
          gated ? "min-h-[160px]" : ""
        }`}
      >
        <div
          className={`p-4 space-y-3 ${
            gated ? "pointer-events-none select-none opacity-60" : ""
          }`}
          aria-hidden={gated || undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cloud className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Cloud sync</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {statusDescription}
              </p>
            </div>
            <Switch
              checked={isOn}
              disabled={gated || isSyncing}
              onCheckedChange={handleToggleChange}
              aria-label="Toggle cloud sync"
            />
          </div>

          {isOn && !gated && <LostPassphrasePanel />}
        </div>

        {gated && (
          <GateOverlay
            variant={selfHosted ? "self-host" : "license"}
            onUpgrade={() => goToSettings(navigate, "subscription")}
          />
        )}
      </div>

      <DangerZone
        paid={tier !== "free"}
        onDelete={() => setConfirmation("delete")}
      />

      {subFlow === "choose" && (
        <ChooseSyncFlow
          open
          onOpenChange={(o) => !o && setSubFlow("none")}
          onNew={handleStartSetup}
          onExisting={handleConnectExisting}
        />
      )}

      {subFlow === "setup" && (
        <SetupWizard
          open
          onOpenChange={(o) => !o && setSubFlow("none")}
          passphrase={passphrase}
          onEnable={async () => {
            await enableSync(passphrase);
            setSubFlow("none");
          }}
        />
      )}

      {subFlow === "existing" && (
        <ExistingCloudFlow
          open
          onOpenChange={(o) => !o && setSubFlow("none")}
          onCancel={() => setSubFlow("none")}
          localFeedCount={localFeedCount}
          onSwitch={(p) => switchToExistingCloud(p, "merge")}
        />
      )}

      <DeleteAllDataConfirm
        open={confirmation === "delete"}
        onOpenChange={(o) => !o && setConfirmation("none")}
        pending={pending}
        paid={tier !== "free"}
        onConfirm={handleDeleteAll}
      />

      <DisableSyncFork
        open={confirmation === "disable"}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmation("none");
            setDisableError(null);
          }
        }}
        pending={pending}
        error={disableError}
        onKeepVault={handleDisableKeepVault}
        onDeleteVault={handleDisableDeleteVault}
      />
    </div>
  );
}

interface GateOverlayProps {
  variant: "license" | "self-host";
  onUpgrade: () => void;
}

/**
 * Locked-state overlay for the Cloud sync card. Renders inside the parent's
 * `overflow-hidden` container with `absolute inset-0` so the blurred glass
 * is exactly the size of the card it covers — never overflows above (into
 * the tab strip) or below (into the Danger zone).
 *
 * Frosted-glass surface (`GLASS_CLASSES`):
 * - `bg-card/40` — light tint so the toggle behind reads through.
 * - `backdrop-blur-lg` — strong frosted blur on whatever sits behind.
 *   Falls back gracefully on browsers without `backdrop-filter`
 *   (Safari ≥9, Chrome ≥76, Firefox ≥103); the tint alone still dims
 *   the toggle.
 * - `ring-1 ring-inset ring-foreground/10` — subtle inset edge that
 *   defines the glass surface against the card border.
 * - `supports-[backdrop-filter]:bg-card/30` — lighter tint when blur is
 *   actually doing the visual work, heavier tint when it isn't.
 *
 * Content is centred and intentionally compact: lock icon + one-line
 * message + one button. No nested card frame, which is what caused the
 * prior layout to overflow on mobile when the parent card was shorter
 * than the overlay's own content.
 */
const GLASS_CLASSES =
  "absolute inset-0 flex items-center justify-center px-4 " +
  "bg-card/40 supports-[backdrop-filter]:bg-card/30 " +
  "backdrop-blur-lg ring-1 ring-inset ring-foreground/10";

function GateOverlay({ variant, onUpgrade }: GateOverlayProps) {
  if (variant === "self-host") {
    return (
      <div className={GLASS_CLASSES}>
        <div className="text-center space-y-2 max-w-xs">
          <Lock className="mx-auto size-5 text-foreground/70" />
          <p className="text-sm font-medium">Sync server not configured</p>
          <Button asChild size="sm" variant="outline">
            <a href={SELF_HOST_DOCS_URL} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="mr-2 size-3.5" />
              Self-hosting docs
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={GLASS_CLASSES}>
      <div className="text-center space-y-2 max-w-xs">
        <Lock className="mx-auto size-5 text-foreground/70" />
        <p className="text-sm font-medium">Cloud sync requires a subscription</p>
        <Button size="sm" onClick={onUpgrade}>
          Upgrade plan
        </Button>
      </div>
    </div>
  );
}

interface DangerZoneProps {
  paid: boolean;
  onDelete: () => void;
}

function DangerZone({ paid, onDelete }: DangerZoneProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h3 className="text-xs font-medium text-destructive uppercase tracking-wider">
        Danger zone
      </h3>
      {paid && (
        <p className="text-xs text-muted-foreground">
          Your subscription will stay active after deletion. Cancel it from
          the Stripe Customer Portal if you no longer need it.
        </p>
      )}
      <Button
        variant="outline"
        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="mr-2 size-4" />
        Delete all data and reset app
      </Button>
    </div>
  );
}

interface ChooseSyncFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNew: () => void;
  onExisting: () => void;
}

function ChooseSyncFlow({
  open,
  onOpenChange,
  onNew,
  onExisting,
}: ChooseSyncFlowProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn on cloud sync</DialogTitle>
          <DialogDescription>
            Set up fresh end-to-end encrypted sync, or connect a passphrase
            you already use on another device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={onNew}>
            <Cloud className="mr-2 size-4" />
            Set up new cloud sync
          </Button>
          <Button variant="outline" className="w-full" onClick={onExisting}>
            <DownloadCloud className="mr-2 size-4" />
            Connect existing cloud store
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteAllDataConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  paid: boolean;
  onConfirm: () => void;
}

function DeleteAllDataConfirm({
  open,
  onOpenChange,
  pending,
  paid,
  onConfirm,
}: DeleteAllDataConfirmProps) {
  const [portalBusy, setPortalBusy] = useState(false);

  async function openStripePortal() {
    setPortalBusy(true);
    await openPortal();
    setPortalBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center py-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
          </div>
          <DialogTitle className="text-center">
            Delete all data and reset app?
          </DialogTitle>
          <DialogDescription className="text-center">
            This will permanently delete all your feeds, articles, and (if
            sync is on) the encrypted cloud vault. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        {paid && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs">
            <Info className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-2">
              <p>
                Your Stripe subscription will keep billing after deletion.
                Cancel it from the Customer Portal if you no longer need it.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openStripePortal}
                disabled={portalBusy}
              >
                {portalBusy ? "Opening Stripe…" : "Manage subscription"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="destructive"
            className="w-full"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 size-4" />
                Delete everything
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
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

interface DisableSyncForkProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  onKeepVault: () => void;
  onDeleteVault: () => void;
}

/**
 * "Turn off sync" fork — two destructive paths that look similar but have
 * very different blast radius. Keep cloud store is the safe choice
 * (recoverable on another device); Delete cloud store forever is
 * irreversible. The destructive variant uses variant="destructive" + the
 * explicit "forever" word so the user can't accidentally pick it thinking
 * it's the safe option.
 */
function DisableSyncFork({
  open,
  onOpenChange,
  pending,
  error,
  onKeepVault,
  onDeleteVault,
}: DisableSyncForkProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Turn off cloud sync?</DialogTitle>
          <DialogDescription className="text-center">
            Sync will stop on this device. Your local feeds and articles
            stay here. Choose what to do with the encrypted store on the
            server.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={onKeepVault}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Keep cloud store
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            onClick={onDeleteVault}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Delete cloud store forever
          </Button>
          <Button
            variant="ghost"
            className="w-full"
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
