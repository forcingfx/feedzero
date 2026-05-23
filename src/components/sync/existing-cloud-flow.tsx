/**
 * <ExistingCloudFlow> — connect to an existing cloud store by passphrase.
 *
 * Single-mode flow (always merge with local precedence):
 *   1. User pastes the passphrase from another device.
 *   2. We probe whether a vault exists for that passphrase — wrong
 *      passphrase = clear error, no destructive op.
 *   3. We merge cloud into local; local wins on conflict. Per ADR
 *      014-equivalent (codified in user spec): local state takes
 *      precedence because the user is sitting in front of it right now,
 *      not in front of the other device.
 *
 * The replace/merge picker that lived here before was removed in the
 * redesign — most users picked the wrong option and lost data either way.
 * Power users who want a clean cloud copy can use "Delete all data" first.
 */
import { useState } from "react";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { checkVaultExists } from "@/core/sync/sync-service";
import { toast } from "sonner";
import type { Result } from "@feedzero/core/utils/result";

type ExistingStep =
  | "passphrase"
  | "checking"
  | "syncing"
  | "done"
  | "error"
  | "not-found";

interface ExistingCloudFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  localFeedCount: number;
  /** Always called with the "merge" mode under the hood; see component header. */
  onSwitch: (passphrase: string) => Promise<Result<boolean>>;
}

export function ExistingCloudFlow({
  open,
  onOpenChange,
  onCancel,
  localFeedCount,
  onSwitch,
}: ExistingCloudFlowProps) {
  const [step, setStep] = useState<ExistingStep>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setStep("checking");
    setError(null);

    const existsResult = await checkVaultExists(passphrase);
    if (!existsResult.ok) {
      setError(existsResult.error);
      setStep("error");
      return;
    }
    if (!existsResult.value) {
      setStep("not-found");
      return;
    }

    setStep("syncing");
    const result = await onSwitch(passphrase);
    if (!result.ok) {
      setError(result.error);
      setStep("error");
      return;
    }

    setStep("done");
    toast.success("Connected to cloud store");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={step !== "checking" && step !== "syncing"}
      >
        {step === "passphrase" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect existing cloud store</DialogTitle>
              <DialogDescription>
                Enter the passphrase you set on another device. We&apos;ll
                combine that cloud store with what you already have here.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">
                What &ldquo;combine&rdquo; means
              </p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>
                  Feeds only on cloud are added to this device.
                </li>
                <li>
                  Feeds only on this device are pushed to the cloud on the
                  next sync.
                </li>
                <li>
                  When the same feed exists in both, the one on{" "}
                  <strong>this device</strong> wins (its title, folder, and
                  read state are kept). Same rule for articles, matched by
                  GUID.
                </li>
              </ul>
              {localFeedCount > 0 && (
                <p className="pt-1">
                  You currently have {localFeedCount} local feed
                  {localFeedCount !== 1 ? "s" : ""}.
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passphrase.trim()) handleConnect();
              }}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter your passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="off"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <DialogFooter className="mt-4 flex-row gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!passphrase.trim()}>
                  Connect
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "checking" && (
          <>
            <DialogHeader>
              <DialogTitle>Checking passphrase</DialogTitle>
              <DialogDescription>
                Looking for your cloud store...
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "syncing" && (
          <>
            <DialogHeader>
              <DialogTitle>Combining feeds</DialogTitle>
              <DialogDescription>
                Combining cloud and local feeds…
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
              <DialogTitle>Connected to cloud</DialogTitle>
              <DialogDescription>
                Your feeds are now synced with your cloud store.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                <ShieldCheck className="size-8 text-green-600" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {step === "not-found" && (
          <>
            <DialogHeader>
              <DialogTitle>No cloud store for that passphrase</DialogTitle>
              <DialogDescription>
                We didn&apos;t find an existing cloud store for that
                passphrase. Double-check it, or set up fresh sync instead.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={() => setStep("passphrase")}>Try again</Button>
            </DialogFooter>
          </>
        )}

        {step === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>Could not connect</DialogTitle>
              <DialogDescription>{error}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-8 text-destructive" />
              </div>
            </div>
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={() => setStep("passphrase")}>Try again</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
