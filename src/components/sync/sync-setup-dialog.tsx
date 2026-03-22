import { useState, useEffect } from "react";
import {
  Cloud,
  CloudOff,
  Loader2,
  Trash2,
  AlertTriangle,
  LogOut,
  KeyRound,
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
import { toast } from "sonner";
import { SetupWizard } from "./setup-wizard";
import { ExistingCloudFlow } from "./existing-cloud-flow";

type DialogView =
  | "status"
  | "setup"
  | "existing"
  | "confirm-delete"
  | "confirm-disable"
  | "confirm-logout";

interface ConfirmationViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "default" | "destructive";
  confirmIcon?: React.ReactNode;
}

function ConfirmationView({
  open,
  onOpenChange,
  icon,
  title,
  description,
  confirmLabel,
  loadingLabel,
  isLoading,
  onConfirm,
  onCancel,
  variant = "default",
  confirmIcon,
}: ConfirmationViewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center py-2">{icon}</div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              <>
                {confirmIcon}
                {confirmLabel}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SyncSetupDialog() {
  const status = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.error);
  const enableSync = useSyncStore((s) => s.enableSync);
  const disableSync = useSyncStore((s) => s.disableSync);
  const logout = useSyncStore((s) => s.logout);
  const switchToExistingCloud = useSyncStore((s) => s.switchToExistingCloud);
  const resetApp = useAppStore((s) => s.resetApp);
  const localFeedCount = useFeedStore((s) => s.feeds.length);
  const open = useSyncStore((s) => s.dialogOpen);
  const onOpenChange = useSyncStore((s) => s.setDialogOpen);

  const [view, setView] = useState<DialogView>("status");
  const [passphrase, setPassphrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("status");
      setPassphrase("");
      setIsDeleting(false);
      setIsDisabling(false);
      setIsLoggingOut(false);
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function handleStartSetup() {
    setPassphrase(generatePassphrase());
    setView("setup");
  }

  async function handleDisableSync() {
    setIsDisabling(true);
    await disableSync();
    setIsDisabling(false);
    toast("Sync disabled. Server data deleted.");
    handleOpenChange(false);
  }

  async function handleDeleteAll() {
    setIsDeleting(true);
    await resetApp();
    await disableSync();
    handleOpenChange(false);
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    handleOpenChange(false);
  }

  const getStatusDescription = () => {
    switch (status) {
      case "local-only":
        return "Your data is stored locally in this browser only.";
      case "synced":
        return "Your data is encrypted and synced across devices.";
      case "syncing":
        return "Sync is in progress...";
      case "error":
        return syncError
          ? `Sync error: ${syncError}`
          : "There was a sync error. Please try again.";
    }
  };

  if (view === "setup") {
    return (
      <SetupWizard
        open={open}
        onOpenChange={handleOpenChange}
        passphrase={passphrase}
        onEnable={() => enableSync(passphrase)}
      />
    );
  }

  if (view === "existing") {
    return (
      <ExistingCloudFlow
        open={open}
        onOpenChange={handleOpenChange}
        onCancel={() => setView("status")}
        localFeedCount={localFeedCount}
        onSwitch={switchToExistingCloud}
      />
    );
  }

  if (view === "confirm-delete") {
    return (
      <ConfirmationView
        open={open}
        onOpenChange={handleOpenChange}
        icon={
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
        }
        title="Delete all data?"
        description="This will permanently delete all your feeds and articles. This action cannot be undone."
        confirmLabel="Delete everything"
        loadingLabel="Deleting..."
        confirmIcon={<Trash2 className="mr-2 size-4" />}
        isLoading={isDeleting}
        onConfirm={handleDeleteAll}
        onCancel={() => setView("status")}
        variant="destructive"
      />
    );
  }

  if (view === "confirm-disable") {
    return (
      <ConfirmationView
        open={open}
        onOpenChange={handleOpenChange}
        icon={
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
            <CloudOff className="size-6 text-amber-600" />
          </div>
        }
        title="Switch to local only?"
        description="This will delete your encrypted data from the server. Your local data will be kept. This cannot be undone."
        confirmLabel="Disable sync"
        loadingLabel="Disabling sync..."
        isLoading={isDisabling}
        onConfirm={handleDisableSync}
        onCancel={() => setView("status")}
      />
    );
  }

  if (view === "confirm-logout") {
    return (
      <ConfirmationView
        open={open}
        onOpenChange={handleOpenChange}
        icon={
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LogOut className="size-6 text-muted-foreground" />
          </div>
        }
        title="Log out of this device?"
        description="This will clear all local data from this browser. Your encrypted cloud backup is preserved — you will need your secret key to access your feeds again."
        confirmLabel="Log out"
        loadingLabel="Logging out..."
        isLoading={isLoggingOut}
        onConfirm={handleLogout}
        onCancel={() => setView("status")}
      />
    );
  }

  // Main status view
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Data & storage</DialogTitle>
          <DialogDescription>{getStatusDescription()}</DialogDescription>
        </DialogHeader>

        {status === "local-only" && (
          <div className="border-t pt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleStartSetup}
            >
              <Cloud className="mr-2 size-4" />
              Enable sync
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setView("existing")}
            >
              <KeyRound className="mr-2 size-4" />
              Use existing cloud account
            </Button>
          </div>
        )}

        {(status === "synced" ||
          status === "syncing" ||
          status === "error") && (
          <div className="border-t pt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setView("confirm-disable")}
              disabled={status === "syncing"}
            >
              <CloudOff className="mr-2 size-4" />
              Switch to local only
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setView("confirm-logout")}
              disabled={status === "syncing"}
            >
              <LogOut className="mr-2 size-4" />
              Log out of this device
            </Button>
          </div>
        )}

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-destructive mb-2">
            Danger zone
          </p>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setView("confirm-delete")}
          >
            <Trash2 className="mr-2 size-4" />
            Delete all data
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
