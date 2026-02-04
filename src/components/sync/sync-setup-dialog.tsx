import { useState, useCallback, useEffect } from "react";
import {
  Copy,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  Trash2,
  AlertTriangle,
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
import { Checkbox } from "@/components/ui/checkbox";
import { generatePassphrase } from "@/core/crypto/passphrase-generator";
import { useSyncStore } from "@/stores/sync-store";
import { useAppStore } from "@/stores/app-store";
import { toast } from "sonner";

type SetupStep = "passphrase" | "syncing" | "done";
type DialogView = "status" | "setup" | "confirm-delete" | "confirm-disable";

export function SyncSetupDialog() {
  const status = useSyncStore((s) => s.status);
  const enableSync = useSyncStore((s) => s.enableSync);
  const disableSync = useSyncStore((s) => s.disableSync);
  const resetApp = useAppStore((s) => s.resetApp);
  const open = useSyncStore((s) => s.dialogOpen);
  const onOpenChange = useSyncStore((s) => s.setDialogOpen);

  const [view, setView] = useState<DialogView>("status");
  const [setupStep, setSetupStep] = useState<SetupStep>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  // Reset all internal state when dialog closes
  useEffect(() => {
    if (!open) {
      setView("status");
      setSetupStep("passphrase");
      setPassphrase("");
      setSaved(false);
      setCopied(false);
      setIsDeleting(false);
      setIsDisabling(false);
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function handleStartSetup() {
    setPassphrase(generatePassphrase());
    setSetupStep("passphrase");
    setView("setup");
  }

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  async function handleEnable() {
    setSetupStep("syncing");
    await enableSync(passphrase);
    setSetupStep("done");
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

  const getStatusDescription = () => {
    switch (status) {
      case "local-only":
        return "Your data is stored locally in this browser only.";
      case "synced":
        return "Your data is encrypted and synced across devices.";
      case "syncing":
        return "Sync is in progress...";
      case "error":
        return "There was a sync error. Please try again.";
    }
  };

  // --- Setup wizard views ---
  if (view === "setup") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={setupStep !== "syncing"}>
          {setupStep === "passphrase" && (
            <>
              <DialogHeader>
                <DialogTitle>Your secret key</DialogTitle>
                <DialogDescription>
                  This key is the only way to access your synced data. Save it
                  somewhere safe — it cannot be recovered.
                </DialogDescription>
              </DialogHeader>

              <div className="relative rounded-md border bg-muted p-4">
                <p className="text-center font-mono text-lg tracking-wide select-all">
                  {passphrase}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 size-7"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={saved}
                  onCheckedChange={(v) => setSaved(v === true)}
                />
                I&apos;ve saved my secret key
              </label>

              <DialogFooter>
                <Button onClick={handleEnable} disabled={!saved}>
                  Enable sync
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === "syncing" && (
            <>
              <DialogHeader>
                <DialogTitle>Setting up sync</DialogTitle>
                <DialogDescription>
                  Encrypting and syncing your data...
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-6">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            </>
          )}

          {setupStep === "done" && (
            <>
              <DialogHeader>
                <DialogTitle>Sync is set up</DialogTitle>
                <DialogDescription>
                  Your data is now encrypted and synced. Enter your secret key
                  on any device to access your feeds.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-4">
                <Cloud className="size-10 text-primary" />
              </div>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // --- Delete all data confirmation ---
  if (view === "confirm-delete") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center py-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-center">Delete all data?</DialogTitle>
            <DialogDescription className="text-center">
              This will permanently delete all your feeds and articles. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="w-full"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 size-4" />
                  Delete everything
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setView("status")}
              disabled={isDeleting}
              className="w-full"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Disable sync confirmation ---
  if (view === "confirm-disable") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center py-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
                <CloudOff className="size-6 text-amber-600" />
              </div>
            </div>
            <DialogTitle className="text-center">
              Switch to local only?
            </DialogTitle>
            <DialogDescription className="text-center">
              This will delete your encrypted data from the server. Your local
              data will be kept. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="default"
              onClick={handleDisableSync}
              disabled={isDisabling}
              className="w-full"
            >
              {isDisabling ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Disabling sync...
                </>
              ) : (
                "Disable sync"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setView("status")}
              disabled={isDisabling}
              className="w-full"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Main status view ---
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Data & storage</DialogTitle>
          <DialogDescription>{getStatusDescription()}</DialogDescription>
        </DialogHeader>

        {/* Sync actions — enable or disable */}
        {status === "local-only" && (
          <div className="border-t pt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleStartSetup}
            >
              <Cloud className="mr-2 size-4" />
              Enable sync
            </Button>
          </div>
        )}

        {(status === "synced" ||
          status === "syncing" ||
          status === "error") && (
          <div className="border-t pt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setView("confirm-disable")}
              disabled={status === "syncing"}
            >
              <CloudOff className="mr-2 size-4" />
              Switch to local only
            </Button>
          </div>
        )}

        {/* Danger zone */}
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
