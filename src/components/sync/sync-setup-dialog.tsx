import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  Cloud,
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

type Step = "welcome" | "passphrase" | "syncing" | "done";

export function SyncSetupDialog() {
  const status = useSyncStore((s) => s.status);
  const enableSync = useSyncStore((s) => s.enableSync);
  const setSynced = useSyncStore((s) => s.setSynced);
  const open = useSyncStore((s) => s.dialogOpen);
  const onOpenChange = useSyncStore((s) => s.setDialogOpen);

  const [step, setStep] = useState<Step>("welcome");
  const [passphrase, setPassphrase] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("welcome");
      setPassphrase("");
      setSaved(false);
      setCopied(false);
    }
    onOpenChange(nextOpen);
  }

  function handleGenerate() {
    setPassphrase(generatePassphrase());
    setStep("passphrase");
  }

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  async function handleEnable() {
    setStep("syncing");
    enableSync(passphrase);
    // TODO: Phase 3 will wire this to actual sync (re-encrypt + push).
    // For now, simulate a short delay then mark as synced.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSynced(Date.now());
    setStep("done");
  }

  // Show status/settings dialog for all states (including local-only)
  if (
    status === "synced" ||
    status === "syncing" ||
    status === "error" ||
    status === "local-only"
  ) {
    return (
      <StatusDialog
        open={open}
        onOpenChange={handleOpenChange}
        status={status}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={step !== "syncing"}>
        {step === "welcome" && (
          <>
            <DialogHeader>
              <DialogTitle>Set up sync</DialogTitle>
              <DialogDescription>
                Your feeds are stored locally in this browser. Enable sync to
                access them from any device — encrypted so only you can read
                them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleGenerate}>Generate secret key</Button>
            </DialogFooter>
          </>
        )}

        {step === "passphrase" && (
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

        {step === "syncing" && (
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

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>Sync is set up</DialogTitle>
              <DialogDescription>
                Your data is now encrypted and synced. Enter your secret key on
                any device to access your feeds.
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

interface StatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "local-only" | "synced" | "syncing" | "error";
}

function StatusDialog({ open, onOpenChange, status }: StatusDialogProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const resetApp = useAppStore((s) => s.resetApp);
  const disableSync = useSyncStore((s) => s.disableSync);

  const handleDelete = async () => {
    setIsDeleting(true);
    await resetApp();
    disableSync();
    onOpenChange(false);
  };

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

  if (showConfirm) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
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
              onClick={handleDelete}
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
              onClick={() => setShowConfirm(false)}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Data & storage</DialogTitle>
          <DialogDescription>{getStatusDescription()}</DialogDescription>
        </DialogHeader>

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-destructive mb-2">
            Danger zone
          </p>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="mr-2 size-4" />
            Delete all data
          </Button>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
