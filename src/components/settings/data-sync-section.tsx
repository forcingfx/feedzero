/**
 * Inline cloud-sync controls for the Data tab.
 *
 * Renders the status view + buttons inline (no Dialog wrapper).
 * SetupWizard, ExistingCloudFlow, and confirmation prompts stay as
 * nested dialogs triggered by the inline buttons — Radix Dialog stacks
 * cleanly on top of the parent stage page via portals.
 */
import { useState } from "react";
import {
  Cloud,
  CloudOff,
  Trash2,
  AlertTriangle,
  LogOut,
  KeyRound,
  DownloadCloud,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generatePassphrase } from "@/core/crypto/passphrase-generator";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useAppStore } from "@/stores/app-store";
import { useLicenseStore } from "@/stores/license-store";
import { openPortal } from "@/lib/open-portal";
import { toast } from "sonner";
import { SetupWizard } from "@/components/sync/setup-wizard";
import { ExistingCloudFlow } from "@/components/sync/existing-cloud-flow";

type Confirmation = "none" | "delete" | "disable" | "logout" | "restore";
type SubFlow = "none" | "setup" | "existing";

export function DataSyncSection() {
  const status = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.error);
  const enableSync = useSyncStore((s) => s.enableSync);
  const disableSync = useSyncStore((s) => s.disableSync);
  const deleteCloudVault = useSyncStore((s) => s.deleteCloudVault);
  const logout = useSyncStore((s) => s.logout);
  const forceResync = useSyncStore((s) => s.forceResync);
  const switchToExistingCloud = useSyncStore((s) => s.switchToExistingCloud);
  const resetApp = useAppStore((s) => s.resetApp);
  const localFeedCount = useFeedStore((s) => s.feeds.length);

  const [confirmation, setConfirmation] = useState<Confirmation>("none");
  const [subFlow, setSubFlow] = useState<SubFlow>("none");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function handleStartSetup() {
    setPassphrase(await generatePassphrase());
    setSubFlow("setup");
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
        `Couldn't delete cloud vault: ${deleteResult.error}. Sync is still on locally — retry, or choose "Keep cloud vault".`,
      );
      return;
    }
    await disableSync();
    setPending(false);
    setConfirmation("none");
    toast("Sync disabled. Cloud vault deleted.");
  }

  function DangerZone() {
    const tier = useLicenseStore((s) => s.tier);
    const [portalBusy, setPortalBusy] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);

    async function onManageSubscription() {
      setPortalBusy(true);
      setPortalError(null);
      const result = await openPortal();
      if (!result.ok) {
        setPortalError(result.error ?? "Couldn't open Stripe portal");
      }
      setPortalBusy(false);
    }

    if (tier !== "free") {
      // Paid users can't delete data without first canceling the
      // subscription — otherwise Stripe keeps billing them for an account
      // they no longer have anywhere to use. Route them to the Customer
      // Portal first.
      return (
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-destructive">Danger zone</p>
          <p className="text-xs text-muted-foreground">
            You have an active subscription. Cancel it in the Stripe
            Customer Portal before deleting your data — otherwise the
            subscription stays active with nothing to use it on.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={onManageSubscription}
            disabled={portalBusy}
          >
            {portalBusy ? "Opening Stripe…" : "Manage subscription"}
          </Button>
          {portalError && (
            <p className="text-xs text-destructive">{portalError}</p>
          )}
        </div>
      );
    }

    return (
      <div className="border-t pt-3">
        <p className="text-xs font-medium text-destructive mb-2">Danger zone</p>
        <Button
          variant="outline"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmation("delete")}
        >
          <Trash2 className="mr-2 size-4" />
          Delete all data
        </Button>
      </div>
    );
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

  async function handleLogout() {
    setPending(true);
    await logout();
    setPending(false);
    setConfirmation("none");
  }

  async function handleRestore() {
    setPending(true);
    const result = await forceResync();
    setPending(false);
    if (result.ok) {
      toast(`Restored ${result.value.feedCount} feeds from cloud.`);
    } else {
      toast.error(`Restore failed: ${result.error}`);
    }
    setConfirmation("none");
  }

  const statusDescription = (() => {
    switch (status) {
      case "local-only":
        return "Your data is stored locally in this browser only.";
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
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Cloud sync</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{statusDescription}</p>
      </div>

      {status === "local-only" && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={handleStartSetup}>
            <Cloud className="mr-2 size-4" />
            Enable sync
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSubFlow("existing")}
          >
            <KeyRound className="mr-2 size-4" />
            Use existing cloud account
          </Button>
        </div>
      )}

      {(status === "synced" || status === "syncing" || status === "error") && (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setConfirmation("disable")}
            disabled={status === "syncing"}
          >
            <CloudOff className="mr-2 size-4" />
            Switch to local only
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setConfirmation("restore")}
            disabled={status === "syncing"}
          >
            <DownloadCloud className="mr-2 size-4" />
            Restore from cloud
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setConfirmation("logout")}
            disabled={status === "syncing"}
          >
            <LogOut className="mr-2 size-4" />
            Log out of this device
          </Button>
        </div>
      )}

      <DangerZone />


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
          onSwitch={switchToExistingCloud}
        />
      )}

      <Confirm
        open={confirmation === "delete"}
        onOpenChange={(o) => !o && setConfirmation("none")}
        icon={<AlertTriangle className="size-6 text-destructive" />}
        iconBg="bg-destructive/10"
        title="Delete all data?"
        description="This will permanently delete all your feeds and articles. This action cannot be undone."
        confirmLabel="Delete everything"
        loadingLabel="Deleting…"
        confirmIcon={<Trash2 className="mr-2 size-4" />}
        isLoading={pending}
        onConfirm={handleDeleteAll}
        variant="destructive"
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

      <Confirm
        open={confirmation === "restore"}
        onOpenChange={(o) => !o && setConfirmation("none")}
        icon={<DownloadCloud className="size-6 text-blue-600" />}
        iconBg="bg-blue-100"
        title="Restore from cloud?"
        description="This will replace your local feeds and articles with what's stored in the cloud. Use this if a device shows the wrong feed list after sync."
        confirmLabel="Restore"
        loadingLabel="Restoring…"
        confirmIcon={<DownloadCloud className="mr-2 size-4" />}
        isLoading={pending}
        onConfirm={handleRestore}
      />

      <Confirm
        open={confirmation === "logout"}
        onOpenChange={(o) => !o && setConfirmation("none")}
        icon={<LogOut className="size-6 text-muted-foreground" />}
        iconBg="bg-muted"
        title="Log out of this device?"
        description="This will clear all local data from this browser. Your encrypted cloud backup is preserved — you will need your secret key to access your feeds again."
        confirmLabel="Log out"
        loadingLabel="Logging out…"
        isLoading={pending}
        onConfirm={handleLogout}
      />
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel: string;
  isLoading: boolean;
  onConfirm: () => void;
  variant?: "default" | "destructive";
  confirmIcon?: React.ReactNode;
}

function Confirm(props: ConfirmProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center py-2">
            <div className={`flex size-12 items-center justify-center rounded-full ${props.iconBg}`}>
              {props.icon}
            </div>
          </div>
          <DialogTitle className="text-center">{props.title}</DialogTitle>
          <DialogDescription className="text-center">{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant={props.variant ?? "default"}
            className="w-full"
            onClick={props.onConfirm}
            disabled={props.isLoading}
            aria-busy={props.isLoading}
          >
            {props.isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {props.loadingLabel}
              </>
            ) : (
              <>
                {props.confirmIcon}
                {props.confirmLabel}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => props.onOpenChange(false)}
            disabled={props.isLoading}
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
 * "Switch to local only" fork — two destructive paths that look similar
 * but have very different blast radius. Keep cloud vault is the safe
 * choice (recoverable on another device); Delete cloud vault forever is
 * the destructive choice (irreversible, vault is gone). The destructive
 * variant uses variant="destructive" + explicit "forever" copy so the
 * user can't accidentally pick it thinking it's the safe option.
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
          <div className="flex justify-center py-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
              <CloudOff className="size-6 text-amber-600" />
            </div>
          </div>
          <DialogTitle className="text-center">Switch to local only?</DialogTitle>
          <DialogDescription className="text-center">
            Sync will stop on this device. Your local feeds and articles
            stay here. Choose what to do with the encrypted vault on the
            server.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={onKeepVault}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CloudOff className="mr-2 size-4" />
            )}
            Keep cloud vault
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
            Delete cloud vault forever
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
