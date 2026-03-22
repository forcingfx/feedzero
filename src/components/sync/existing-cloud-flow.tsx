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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { checkVaultExists, pullVault } from "@/core/sync/sync-service";
import { toast } from "sonner";
import type { Result } from "@/utils/result";

type ExistingStep =
  | "passphrase"
  | "checking"
  | "merge-options"
  | "syncing"
  | "done"
  | "error";
type MergeMode = "replace" | "merge";

interface ExistingCloudFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  localFeedCount: number;
  onSwitch: (passphrase: string, mode: MergeMode) => Promise<Result<boolean>>;
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
  const [cloudFeedCount, setCloudFeedCount] = useState(0);
  const [mergeMode, setMergeMode] = useState<MergeMode>("replace");

  async function handleCheckPassphrase() {
    setStep("checking");
    setError(null);

    const existsResult = await checkVaultExists(passphrase);
    if (!existsResult.ok) {
      setError(existsResult.error);
      setStep("error");
      return;
    }

    if (!existsResult.value) {
      setError(
        "No cloud data found for this passphrase. Check that you entered it correctly.",
      );
      setStep("error");
      return;
    }

    const pullResult = await pullVault(passphrase);
    if (!pullResult.ok) {
      setError(pullResult.error);
      setStep("error");
      return;
    }

    setCloudFeedCount(pullResult.value.feeds.length);
    setStep("merge-options");
  }

  async function handleSwitch() {
    setStep("syncing");

    const result = await onSwitch(passphrase, mergeMode);
    if (!result.ok) {
      setError(result.error);
      setStep("error");
      return;
    }

    setStep("done");
    toast.success("Connected to cloud account");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={step !== "checking" && step !== "syncing"}
      >
        {step === "passphrase" && (
          <>
            <DialogHeader>
              <DialogTitle>Use existing cloud account</DialogTitle>
              <DialogDescription>
                Enter your passphrase to connect to an existing cloud account.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passphrase.trim()) handleCheckPassphrase();
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
                Looking for your cloud account...
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "merge-options" && (
          <>
            <DialogHeader>
              <DialogTitle>Cloud account found</DialogTitle>
              <DialogDescription>
                Found {cloudFeedCount} feed{cloudFeedCount !== 1 ? "s" : ""} in
                cloud.
                {localFeedCount > 0 &&
                  ` You have ${localFeedCount} local feed${localFeedCount !== 1 ? "s" : ""}.`}
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={mergeMode}
              onValueChange={(v) => setMergeMode(v as MergeMode)}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="replace" id="replace" />
                <div className="space-y-1">
                  <Label htmlFor="replace" className="font-medium">
                    Replace local with cloud
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Your local feeds will be deleted.
                  </p>
                </div>
              </div>
              {localFeedCount > 0 && (
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="merge" id="merge" />
                  <div className="space-y-1">
                    <Label htmlFor="merge" className="font-medium">
                      Merge feeds
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Keep both local and cloud feeds. Duplicates will be
                      skipped.
                    </p>
                  </div>
                </div>
              )}
            </RadioGroup>

            <DialogFooter className="mt-4 flex-row gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={handleSwitch}>Continue</Button>
            </DialogFooter>
          </>
        )}

        {step === "syncing" && (
          <>
            <DialogHeader>
              <DialogTitle>Switching to cloud</DialogTitle>
              <DialogDescription>
                {mergeMode === "merge"
                  ? "Merging and syncing your feeds..."
                  : "Importing your cloud data..."}
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
                Your feeds are now synced with your cloud account.
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
