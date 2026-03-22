import { useState, useCallback } from "react";
import { Copy, Check, Loader2, ShieldCheck } from "lucide-react";
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

type SetupStep = "passphrase" | "confirm" | "syncing" | "done";

interface SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passphrase: string;
  onEnable: () => Promise<void>;
}

export function SetupWizard({
  open,
  onOpenChange,
  passphrase,
  onEnable,
}: SetupWizardProps) {
  const [step, setStep] = useState<SetupStep>("passphrase");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  async function handleEnable() {
    setStep("syncing");
    await onEnable();
    setStep("done");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={step !== "syncing"}>
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
              <Button
                onClick={() => setStep("confirm")}
                disabled={!saved}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm your secret key</DialogTitle>
              <DialogDescription>
                Enter your secret key to confirm you've saved it correctly.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const normalized = confirmInput.toLowerCase().trim();
                const expected = passphrase.toLowerCase().trim();
                if (normalized === expected) {
                  setConfirmError(null);
                  handleEnable();
                } else {
                  setConfirmError("That doesn't match. Try again.");
                }
              }}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter your secret key"
                  value={confirmInput}
                  onChange={(e) => {
                    setConfirmInput(e.target.value);
                    setConfirmError(null);
                  }}
                  autoComplete="off"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {confirmError && (
                  <p className="text-sm text-destructive">{confirmError}</p>
                )}
              </div>

              <DialogFooter className="mt-4 flex-row gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("passphrase")}
                >
                  Back
                </Button>
                <Button type="submit">Enable sync</Button>
              </DialogFooter>
            </form>
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
                Your data is now encrypted and synced. Enter your secret key
                on any device to access your feeds.
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
      </DialogContent>
    </Dialog>
  );
}
